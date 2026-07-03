<script lang="ts">
  import { onMount } from 'svelte';
  import { settings, saveSettings, effectIntensity, type CaptureMode } from './lib/settings.svelte';
  import { camera, startCamera, switchCamera, bindVideo } from './lib/camera.svelte';
  import { detectSupport } from './lib/support';
  import { grabFrame, grabGpuFrame, type Layout, type Shot } from './lib/capture';
  import { compose } from './lib/strip';
  import { effectCss, gpuOf, isGpu } from './lib/effects';
  import { ensureGpu, hasWebGL } from './lib/gpu/renderer';
  import { createRecorder, acquireMic, stopMic, canRecord, MAX_CLIP_MS, type RecorderBackend } from './lib/record';
  import { shutterClick, countdownBeep } from './lib/sound';
  import { celebrate } from './lib/confetti';
  import { reel, loadReel, addCapture } from './lib/history.svelte';
  import Booth from './lib/components/Booth.svelte';
  import Review from './lib/components/Review.svelte';
  import Modal from './lib/components/Modal.svelte';
  import Controls from './lib/components/Controls.svelte';
  import Fallback from './lib/components/Fallback.svelte';
  import FxDefs from './lib/components/FxDefs.svelte';

  const support = detectSupport();

  let screen = $state<'booth' | 'review'>('booth');
  let shot = $state<Shot | null>(null);
  let capturing = $state(false);
  let flashing = $state(false);
  let countdown = $state<number | null>(null);
  let burst = $state('');
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let videoEl: HTMLVideoElement | null = null;
  let isFullscreen = $state(false);

  // Source frames of the capture currently under review (for relayout / redo).
  let frames = $state<HTMLCanvasElement[] | null>(null);
  let reviewLayout = $state<Layout>('quad');
  let retakeIndex = $state<number | null>(null);
  let aborted = false;

  // Movie recording state. `recState` drives the record button + control locks;
  // the rest are plumbing kept out of the reactive graph.
  let recState = $state<'idle' | 'countdown' | 'recording'>('idle');
  let recMs = $state(0);
  let movieCanvas: HTMLCanvasElement | null = null;
  let recorder: RecorderBackend | null = null;
  let recStream: MediaStream | null = null;
  let recStartAt = 0;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let recTicker: ReturnType<typeof setInterval> | undefined;

  const currentDeviceLabel = $derived(
    camera.devices.find((d) => d.deviceId === camera.deviceId)?.label || 'Camera',
  );
  const retakeHint = $derived(retakeIndex !== null ? `↺ Redoing photo ${retakeIndex + 1} — get ready!` : '');

  const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const todayStr = (): string =>
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  function showToast(message: string): void {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 2200);
  }

  function doFlash(): void {
    if (!settings.flash) return;
    flashing = false;
    requestAnimationFrame(() => {
      flashing = true;
      setTimeout(() => (flashing = false), 520);
    });
  }

  function registerVideo(el: HTMLVideoElement): void {
    videoEl = el;
    bindVideo(el);
  }

  function registerMovieCanvas(el: HTMLCanvasElement): void {
    movieCanvas = el;
  }

  async function runCountdown(seconds: number): Promise<void> {
    for (let n = seconds; n >= 1; n--) {
      if (aborted) return;
      countdown = n;
      if (settings.sound) countdownBeep(n === 1);
      await delay(850);
    }
    countdown = null;
  }

  function fireShutter(): HTMLCanvasElement {
    if (settings.sound) shutterClick();
    doFlash();
    const id = settings.effect;
    const g = gpuOf(id);
    return g
      ? grabGpuFrame(videoEl!, settings.mirror, g.shaderId, effectIntensity(id))
      : grabFrame(videoEl!, settings.mirror, effectCss(id));
  }

  async function runCapture(): Promise<void> {
    if (settings.mode === 'movie') return; // movie mode records instead of shooting
    if (capturing || camera.status !== 'live' || !videoEl) return;
    capturing = true;
    aborted = false;
    try {
      // Redoing a single cell of a quad/strip that's already on the review screen.
      if (retakeIndex !== null && frames) {
        await runCountdown(settings.countdown);
        if (aborted) return;
        const next = fireShutter();
        const updated = frames.slice();
        updated[retakeIndex] = next;
        const composed = await compose(updated, reviewLayout, { date: todayStr() });
        if (shot) URL.revokeObjectURL(shot.url);
        frames = updated;
        shot = composed;
        retakeIndex = null;
        screen = 'review';
        return;
      }

      const mode = settings.mode;
      const count = mode === 'quad' ? 4 : 1;
      const shots: HTMLCanvasElement[] = [];

      await runCountdown(settings.countdown);
      if (aborted) return;

      for (let i = 0; i < count; i++) {
        if (aborted) return;
        burst = count > 1 ? `${i + 1} / ${count}` : '';
        shots.push(fireShutter());
        if (i < count - 1) await delay(850);
      }

      const layout: Layout = mode === 'quad' ? 'quad' : 'single';
      const composed = await compose(shots, layout, { date: todayStr() });
      if (shot) URL.revokeObjectURL(shot.url);
      frames = mode === 'quad' ? shots : null;
      reviewLayout = layout;
      shot = composed;
      screen = 'review';
      void addCapture(composed);
      celebrate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not take the photo.');
    } finally {
      capturing = false;
      countdown = null;
      burst = '';
    }
  }

  async function relayout(layout: Layout): Promise<void> {
    if (!frames || layout === reviewLayout) return;
    try {
      const composed = await compose(frames, layout, { date: todayStr() });
      if (shot) URL.revokeObjectURL(shot.url);
      reviewLayout = layout;
      shot = composed;
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not switch layout.');
    }
  }

  function retakeCell(index: number): void {
    if (!frames) return;
    retakeIndex = index;
    screen = 'booth';
  }

  function retake(): void {
    retakeIndex = null;
    frames = null;
    screen = 'booth';
  }

  // ---- Movie recording ---------------------------------------------------

  function stopRecTicker(): void {
    clearInterval(recTicker);
    recTicker = undefined;
  }
  function clearMaxTimer(): void {
    clearTimeout(maxTimer);
    maxTimer = undefined;
  }

  /** Release recorder, mic, capture stream and timers. Safe from any exit path. */
  function teardownRecording(): void {
    clearMaxTimer();
    stopRecTicker();
    void recorder?.abort?.(); // release a half-started mp4 backend, if any
    recorder = null;
    stopMic();
    if (recStream) {
      for (const t of recStream.getTracks()) t.stop();
      recStream = null;
    }
    recState = 'idle';
    recMs = 0;
  }

  // Wait until the camera has a real frame so captureStream never records blank
  // opening frames. The movie loop is already painting the canvas continuously.
  function waitForFrame(): Promise<void> {
    return new Promise((resolve) => {
      const check = (): void => {
        if (aborted || (videoEl && videoEl.videoWidth > 0 && movieCanvas && movieCanvas.width > 0)) resolve();
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  async function startRecording(): Promise<void> {
    if (recState !== 'idle' || camera.status !== 'live' || !movieCanvas || !videoEl) return;
    recState = 'countdown';
    aborted = false;

    // 1. Mic BEFORE the countdown — else its permission prompt stalls "3…2…1".
    let micTracks: MediaStreamTrack[] = [];
    if (settings.mic) {
      try {
        micTracks = await acquireMic();
      } catch {
        showToast('Recording without mic — permission denied');
      }
    }
    if (aborted || camera.status !== 'live') {
      stopMic();
      recState = 'idle';
      countdown = null;
      return;
    }

    // 2. Countdown (Esc cancels).
    await runCountdown(settings.countdown);
    if (aborted || camera.status !== 'live') {
      stopMic();
      recState = 'idle';
      countdown = null;
      return;
    }

    // 3. Start once the canvas is genuinely painting.
    await waitForFrame();
    if (aborted || camera.status !== 'live') {
      stopMic();
      recState = 'idle';
      return;
    }

    try {
      recStream = movieCanvas.captureStream(30);
      const vTrack = recStream.getVideoTracks()[0];
      if (!vTrack) throw new Error('no video track');
      // Choosing the backend may lazy-load the mp4 encoder chunk (an await) —
      // re-check we're still live/wanted afterwards, like every other await here.
      recorder = await createRecorder();
      if (aborted || camera.status !== 'live') {
        teardownRecording();
        return;
      }
      await recorder.start(vTrack, micTracks);
      if (aborted || camera.status !== 'live') {
        // Camera dropped during backend startup — finalize/drop and bail.
        try {
          await recorder.stop();
        } catch {
          /* nothing to keep */
        }
        teardownRecording();
        return;
      }
      recState = 'recording';
      recStartAt = performance.now();
      recMs = 0;
      if (settings.sound) countdownBeep(true); // "we're rolling" cue
      recTicker = setInterval(() => {
        recMs = performance.now() - recStartAt;
      }, 200);
      maxTimer = setTimeout(() => {
        showToast('Max length reached');
        void stopRecording(true);
      }, MAX_CLIP_MS);
    } catch {
      teardownRecording();
      showToast('Could not start recording.');
    }
  }

  async function stopRecording(keep: boolean): Promise<void> {
    const rec = recorder;
    if (!rec || recState !== 'recording') return;
    recorder = null; // synchronous re-entry guard against racing stop paths
    clearMaxTimer();
    stopRecTicker();

    let blob: Blob | null = null;
    if (!keep && rec.abort) {
      // Discarding: skip finalize where the backend can (mp4 → output.cancel()).
      try {
        await rec.abort();
      } catch {
        /* already gone */
      }
    } else {
      // ORDER-CRITICAL: the mp4 backend drains the live canvas + mic tracks until
      // stop() (finalize) resolves — so we MUST fully await it BEFORE stopping the
      // mic and capture-stream tracks below, or the clip's tail is lost.
      try {
        blob = await rec.stop();
      } catch {
        /* keep whatever we can */
      }
    }

    stopMic();
    if (recStream) {
      for (const t of recStream.getTracks()) t.stop();
      recStream = null;
    }
    recState = 'idle';
    recMs = 0;

    if (!keep || !blob || blob.size === 0) {
      if (!keep) showToast('Clip discarded');
      return;
    }

    const url = URL.createObjectURL(blob);
    if (shot) URL.revokeObjectURL(shot.url);
    frames = null;
    retakeIndex = null;
    reviewLayout = 'single';
    shot = {
      blob,
      url,
      width: movieCanvas?.width ?? 960,
      height: movieCanvas?.height ?? 720,
      kind: 'single',
      media: 'video',
      createdAt: Date.now(),
    };
    screen = 'review';
    void addCapture(shot);
    celebrate();
  }

  function onRecordButton(): void {
    if (settings.mode !== 'movie') return;
    if (recState === 'idle') void startRecording();
    else if (recState === 'countdown') aborted = true; // cancel the countdown
    else if (recState === 'recording') void stopRecording(true);
  }

  function onDiscardRecord(): void {
    if (recState === 'recording') void stopRecording(false);
  }

  function onVisibility(): void {
    // Hidden tabs throttle rAF → the canvas freezes; stop-and-keep so the clip
    // isn't a frozen frame with a runaway duration.
    if (document.hidden && recState === 'recording') {
      showToast('Recording stopped — tab hidden');
      void stopRecording(true);
    }
  }

  function openReelItem(id: number): void {
    const item = reel.items.find((it) => it.id === id);
    if (!item) return;
    if (shot) URL.revokeObjectURL(shot.url);
    frames = null;
    retakeIndex = null;
    reviewLayout = item.kind;
    shot = {
      blob: item.blob,
      url: URL.createObjectURL(item.blob),
      width: item.w,
      height: item.h,
      kind: item.kind,
      media: item.media ?? 'photo',
      createdAt: item.createdAt,
    };
    screen = 'review';
  }

  function onDeviceChange(e: Event): void {
    const id = (e.currentTarget as HTMLSelectElement).value;
    if (id) void switchCamera(id);
  }

  function setMode(mode: CaptureMode): void {
    if (capturing || recState !== 'idle') return;
    settings.mode = mode;
  }

  function cycleCountdown(): void {
    const seq = [3, 5, 10, 0];
    const i = seq.indexOf(settings.countdown);
    settings.countdown = seq[(i + 1) % seq.length];
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      // In fullscreen, let Esc exit fullscreen — don't also stop a recording.
      if (document.fullscreenElement) return;
      if (recState === 'recording') {
        e.preventDefault();
        void stopRecording(true); // stop-and-keep; discard is the explicit ✕
        return;
      }
      if (recState === 'countdown' || capturing) {
        e.preventDefault();
        aborted = true;
      }
      return;
    }
    if (e.code !== 'Space' || screen !== 'booth' || camera.status !== 'live') return;
    const t = e.target as HTMLElement | null;
    if (t && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(t.tagName)) return;
    e.preventDefault();
    if (settings.mode === 'movie') {
      onRecordButton();
    } else if (!capturing) {
      void runCapture();
    }
  }

  function onFsChange(): void {
    isFullscreen = !!document.fullscreenElement;
  }

  onMount(() => {
    // A GPU effect saved on a WebGL machine can't render without WebGL — fall back.
    if (isGpu(settings.effect) && !hasWebGL()) settings.effect = 'normal';
    // Likewise, don't boot into Movie mode where recording isn't supported.
    if (settings.mode === 'movie' && !canRecord()) settings.mode = 'quad';
    if (!support.secureContext) {
      camera.status = 'error';
      camera.error = 'insecure';
    } else if (!support.getUserMedia) {
      camera.status = 'error';
      camera.error = 'unsupported';
    } else {
      void startCamera();
    }
    void loadReel();
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('visibilitychange', onVisibility);
      teardownRecording();
    };
  });

  // If the camera drops during a movie flow, don't film a dead device: abort an
  // in-flight countdown, and stop-and-keep an active recording.
  $effect(() => {
    if (camera.status === 'error' && recState !== 'idle') {
      aborted = true; // short-circuits a pending runCountdown / waitForFrame
      if (recState === 'recording') void stopRecording(true);
    }
  });

  // Warm the GPU effects chunk (dynamic-import pixi) once the camera is live, so
  // the first time a warp/stylize effect is picked it renders instantly.
  let gpuWarmed = false;
  $effect(() => {
    if (camera.status === 'live' && !gpuWarmed && hasWebGL()) {
      gpuWarmed = true;
      void ensureGpu();
    }
  });

  // Persist settings whenever they change.
  $effect(() => {
    void [
      settings.theme,
      settings.mirror,
      settings.sound,
      settings.flash,
      settings.mode,
      settings.mic,
      settings.countdown,
      settings.effect,
      settings.effectIntensity,
    ];
    saveSettings();
  });

  const countdownLabel = $derived(settings.countdown === 0 ? 'off' : `${settings.countdown}s`);

  const statusText = $derived.by(() => {
    if (camera.status === 'live') return { cls: 'ok', text: '◉ Camera ready' };
    if (camera.status === 'requesting') return { cls: '', text: '◌ Starting camera…' };
    if (camera.status === 'error') return { cls: 'warn', text: '● Camera unavailable' };
    return { cls: '', text: '◌ Idle' };
  });
</script>

<div class="app" data-mode={settings.theme}>
  <!-- Title bar -->
  <div class="titlebar">
    <div class="wordmark"><span class="lens"></span><span>PopStrip</span></div>
  </div>

  <!-- Toolbar -->
  <div class="toolbar">
    <label class="device-pick" title="Choose camera">
      🎥 <span>{currentDeviceLabel}</span>
      {#if camera.devices.length > 1}▾{/if}
      {#if camera.devices.length > 1}
        <select value={camera.deviceId} onchange={onDeviceChange} aria-label="Choose camera" disabled={recState !== 'idle' || capturing}>
          {#each camera.devices as device, i (device.deviceId)}
            <option value={device.deviceId}>{device.label || `Camera ${i + 1}`}</option>
          {/each}
        </select>
      {/if}
    </label>

    <div class="spacer"></div>

    <Controls
      {countdownLabel}
      onCountdown={cycleCountdown}
      {isFullscreen}
      onFullscreen={toggleFullscreen}
      locked={recState !== 'idle'}
    />
  </div>

  <!-- Viewport -->
  <div class="viewport">
    {#if camera.status === 'error'}
      <div class="screen"><Fallback /></div>
    {:else if screen === 'review' && shot}
      <div class="screen">
        <Modal onClose={retake} title={shot.media === 'video' ? 'Nice clip' : 'Looks great'}>
          <Review
            {shot}
            canEdit={!!frames}
            currentLayout={reviewLayout}
            onRetake={retake}
            onRetakeCell={retakeCell}
            onRelayout={relayout}
            onToast={showToast}
          />
        </Modal>
      </div>
    {:else}
      <div class="screen">
        <Booth
          {capturing}
          {countdown}
          {burst}
          hint={retakeHint}
          {recState}
          {recMs}
          onCapture={runCapture}
          onMode={setMode}
          onOpenReel={openReelItem}
          {registerVideo}
          {registerMovieCanvas}
          {onRecordButton}
          {onDiscardRecord}
        />
      </div>
    {/if}
    <div class="flash" class:fire={flashing}></div>
  </div>

  <!-- Status bar -->
  <div class="statusbar">
    <span class={statusText.cls}>{statusText.text}</span>
    <span class="spacer"></span>
    <span class="priv">100% on-device — nothing is uploaded ✓</span>
  </div>

  {#if toast}
    <div class="toast" role="status">{toast}</div>
  {/if}

  <FxDefs />
</div>
