<script lang="ts">
  import { onMount } from 'svelte';
  import { settings, saveSettings, effectIntensity, setFlavor, type CaptureMode } from './lib/settings.svelte';
  import { camera, startCamera, switchCamera, bindVideo } from './lib/camera.svelte';
  import { detectSupport } from './lib/support';
  import { grabFrame, grabGpuFrame, type Layout, type Shot } from './lib/capture';
  import { compose } from './lib/strip';
  import { effectCss, gpuOf, isGpu } from './lib/effects';
  import { ensureGpu, hasWebGL } from './lib/gpu/renderer';
  import { ensureSegmenter, segment } from './lib/segment';
  import { loadBackground, composite } from './lib/backgrounds';
  import { ensureFaceDetector, detectFace } from './lib/face';
  import { drawAR, type OverlayId, type FacePropId } from './lib/overlay';
  import type { FrameId } from './lib/frames';
  import { createRecorder, acquireMic, stopMic, canRecord, MAX_CLIP_MS, type RecorderBackend } from './lib/record';
  import { resetGifFrames, gifFrameCount, gifFrameData, GIF_W, GIF_H, GIF_DELAY_MS } from './lib/gif';
  import { shutterClick, countdownBeep } from './lib/sound';
  import { celebrate } from './lib/confetti';
  import { reel, loadReel, addCapture } from './lib/history.svelte';
  import Booth from './lib/components/Booth.svelte';
  import Review from './lib/components/Review.svelte';
  import Modal from './lib/components/Modal.svelte';
  import Controls from './lib/components/Controls.svelte';
  import CandyPicker from './lib/components/CandyPicker.svelte';
  import FlavorPicker from './lib/components/FlavorPicker.svelte';
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

  // GIF/boomerang: the just-recorded clip's sampled frames (in lib/gif) can be
  // encoded on demand from Review. `gifReady` gates those buttons — true only
  // while the frames belong to the clip currently under review.
  let gifReady = $state(false);
  let gifWorker: Worker | null = null;

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

  /** The active green-screen backdrop id, or 'none' (only in the PopStrip flavor). */
  function activeBackground(): string {
    return settings.flavor !== 'photobooth' ? settings.background || 'none' : 'none';
  }

  /** The active AR overlay id, or 'none' (only in the PopStrip flavor). */
  function activeOverlay(): OverlayId {
    return settings.flavor !== 'photobooth' ? settings.arOverlay || 'none' : 'none';
  }

  /** The active AR face prop id, or 'none' (only in the PopStrip flavor). */
  function activeProp(): FacePropId {
    return settings.flavor !== 'photobooth' ? settings.faceProp || 'none' : 'none';
  }

  /** The active decorative frame id, or 'none' (only in the PopStrip flavor). */
  function activeFrame(): FrameId {
    return settings.flavor !== 'photobooth' ? settings.frame || 'none' : 'none';
  }

  async function fireShutter(): Promise<HTMLCanvasElement> {
    if (settings.sound) shutterClick();
    doFlash();
    const id = settings.effect;
    const g = gpuOf(id);
    // The effect + mirror bake in exactly as before; green-screen then composites
    // the segmented person over the backdrop, and AR bakes the overlay on top.
    const base = g
      ? grabGpuFrame(videoEl!, settings.mirror, g.shaderId, effectIntensity(id))
      : grabFrame(videoEl!, settings.mirror, effectCss(id));
    return await bakeOverlay(await withBackground(base));
  }

  /** Green-screen a captured frame over the chosen backdrop (or return it as-is). */
  async function withBackground(base: HTMLCanvasElement): Promise<HTMLCanvasElement> {
    const bgId = activeBackground();
    if (bgId === 'none') return base;
    try {
      if (!(await ensureSegmenter())) return base;
      const mask = segment(videoEl!, performance.now());
      if (!mask) return base;
      const bg = await loadBackground(bgId, settings.customBackground);
      const composed = composite(base, base.width, base.height, mask, bg, settings.mirror);
      // composite() returns a SHARED scratch canvas the live preview loop keeps
      // overwriting — copy it into an independent frame so a quad burst doesn't
      // end up with four aliases of one canvas showing the last frame.
      const out = document.createElement('canvas');
      out.width = composed.width;
      out.height = composed.height;
      const octx = out.getContext('2d');
      if (!octx) return base;
      octx.drawImage(composed, 0, 0);
      return out;
    } catch {
      return base; // segmentation is best-effort — never fail a capture over it
    }
  }

  /** Bake the AR layer (orbit overlay and/or face prop) onto a captured frame. */
  async function bakeOverlay(frame: HTMLCanvasElement): Promise<HTMLCanvasElement> {
    const overlayId = activeOverlay();
    const propId = activeProp();
    if (overlayId === 'none' && propId === 'none') return frame;
    try {
      if (!(await ensureFaceDetector())) return frame;
      const anchor = detectFace(videoEl!, performance.now());
      if (!anchor) return frame;
      // Copy onto an independent 2D canvas (frame may be a GPU-backed canvas),
      // then composite the AR layer from a transparent canvas so any head-hole
      // reveals the frame's own head rather than punching a hole in the photo.
      const out = document.createElement('canvas');
      out.width = frame.width;
      out.height = frame.height;
      const octx = out.getContext('2d');
      if (!octx) return frame;
      octx.drawImage(frame, 0, 0);
      const layer = document.createElement('canvas');
      layer.width = out.width;
      layer.height = out.height;
      const lctx = layer.getContext('2d');
      if (!lctx) return out;
      drawAR(lctx, overlayId, propId, anchor, performance.now(), settings.mirror, out.width, out.height);
      octx.drawImage(layer, 0, 0);
      return out;
    } catch {
      return frame; // AR is best-effort — never fail a capture over it
    }
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
        const next = await fireShutter();
        const updated = frames.slice();
        updated[retakeIndex] = next;
        const composed = await compose(updated, reviewLayout, { date: todayStr(), frame: activeFrame() });
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
        shots.push(await fireShutter());
        if (i < count - 1) await delay(850);
      }

      const layout: Layout = mode === 'quad' ? 'quad' : 'single';
      const composed = await compose(shots, layout, { date: todayStr(), frame: activeFrame() });
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
      const composed = await compose(frames, layout, { date: todayStr(), frame: activeFrame() });
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
    resetGifFrames(); // leaving the clip → free its sampled frames
    gifReady = false;
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
      resetGifFrames(); // fresh buffer for this clip's GIF/boomerang sampling
      gifReady = false;
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
      resetGifFrames(); // nothing to keep → free the sampled frames
      gifReady = false;
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
    // The sampler captured the first ~6s of this clip; offer GIF/boomerang.
    gifReady = gifFrameCount() > 0;
    screen = 'review';
    void addCapture(shot);
    celebrate();
  }

  // ---- GIF / boomerang export --------------------------------------------

  function ensureGifWorker(): Worker {
    if (!gifWorker) {
      gifWorker = new Worker(new URL('./lib/gif.worker.ts', import.meta.url), { type: 'module' });
    }
    return gifWorker;
  }

  /** Encode the just-recorded clip's frames into an animated GIF (or boomerang)
   *  in a worker, then swap the review over to the result so it can be saved. */
  async function exportGif(boomerang: boolean): Promise<void> {
    if (!gifReady || gifFrameCount() === 0) return;
    let worker: Worker;
    try {
      worker = ensureGifWorker();
    } catch {
      showToast('GIF export isn’t supported here');
      return;
    }
    showToast(boomerang ? 'Making boomerang…' : 'Making GIF…');
    // Not transferred — a copy is sent so the frames survive for the other
    // variant (record once, try GIF *and* boomerang).
    const data = gifFrameData();
    try {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const cleanup = (): void => {
          worker.removeEventListener('message', onMsg);
          worker.removeEventListener('error', onErr);
        };
        const onMsg = (e: MessageEvent): void => {
          cleanup();
          resolve((e.data as { buffer: ArrayBuffer }).buffer);
        };
        const onErr = (e: ErrorEvent): void => {
          cleanup();
          reject(e.error ?? new Error('GIF encode failed'));
        };
        worker.addEventListener('message', onMsg);
        worker.addEventListener('error', onErr);
        worker.postMessage({ width: GIF_W, height: GIF_H, delay: GIF_DELAY_MS, boomerang, frames: data });
      });
      if (buffer.byteLength === 0) throw new Error('empty gif');
      const blob = new Blob([buffer], { type: 'image/gif' });
      const url = URL.createObjectURL(blob);
      if (shot) URL.revokeObjectURL(shot.url);
      frames = null;
      retakeIndex = null;
      reviewLayout = 'single';
      shot = { blob, url, width: GIF_W, height: GIF_H, kind: 'single', media: 'photo', createdAt: Date.now() };
      void addCapture(shot);
      showToast(boomerang ? '✓ Boomerang ready' : '✓ GIF ready');
    } catch {
      showToast('Couldn’t make the GIF');
    }
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
    resetGifFrames(); // a reel item has no live sampled frames
    gifReady = false;
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
      gifWorker?.terminate();
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
      settings.flavor,
      settings.candy,
      settings.favorites,
      settings.background,
      settings.customBackground,
      settings.arOverlay,
      settings.faceProp,
      settings.frame,
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

<div class="app" data-mode={settings.theme} data-flavor={settings.flavor ?? 'popstrip'} data-candy={settings.candy}>
  <!-- Title bar -->
  <div class="titlebar">
    <div class="wordmark"><span class="lens"></span><span>PopStrip</span></div>
    <div class="tb-spacer"></div>
    <div class="flavor-pill" role="group" aria-label="Booth flavor">
      <button
        class="fp-opt"
        class:on={settings.flavor === 'photobooth'}
        onclick={() => setFlavor('photobooth')}
        disabled={recState !== 'idle' || capturing}
        aria-pressed={settings.flavor === 'photobooth'}
        title="Faithful Photo Booth"
      >📷 <span class="fp-label">Photobooth</span></button>
      <button
        class="fp-opt"
        class:on={settings.flavor === 'popstrip'}
        onclick={() => setFlavor('popstrip')}
        disabled={recState !== 'idle' || capturing}
        aria-pressed={settings.flavor === 'popstrip'}
        title="Our extensible booth"
      >✨ <span class="fp-label">PopStrip</span></button>
    </div>
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

    {#if settings.flavor === 'photobooth'}
      <CandyPicker />
    {/if}

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
            canGif={gifReady}
            currentLayout={reviewLayout}
            onRetake={retake}
            onRetakeCell={retakeCell}
            onRelayout={relayout}
            onExportGif={exportGif}
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

  {#if settings.flavor === undefined}
    <FlavorPicker />
  {/if}

  <FxDefs />
</div>
