<script lang="ts">
  import { onMount } from 'svelte';
  import { settings, saveSettings, toggleTheme } from './lib/settings.svelte';
  import { camera, startCamera, switchCamera, bindVideo } from './lib/camera.svelte';
  import { detectSupport } from './lib/support';
  import { grabFrame, type Layout, type Shot } from './lib/capture';
  import { compose } from './lib/strip';
  import { effectCss } from './lib/effects';
  import { shutterClick, countdownBeep } from './lib/sound';
  import { celebrate } from './lib/confetti';
  import { reel, loadReel, addCapture } from './lib/history.svelte';
  import Booth from './lib/components/Booth.svelte';
  import Review from './lib/components/Review.svelte';
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
    return grabFrame(videoEl!, settings.mirror, effectCss(settings.effect));
  }

  async function runCapture(): Promise<void> {
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
      createdAt: item.createdAt,
    };
    screen = 'review';
  }

  function onDeviceChange(e: Event): void {
    const id = (e.currentTarget as HTMLSelectElement).value;
    if (id) void switchCamera(id);
  }

  function setMode(mode: 'single' | 'quad'): void {
    if (!capturing) settings.mode = mode;
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
    if (e.code === 'Escape' && capturing) {
      e.preventDefault();
      aborted = true;
      return;
    }
    if (e.code !== 'Space' || screen !== 'booth' || camera.status !== 'live' || capturing) return;
    const t = e.target as HTMLElement | null;
    if (t && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(t.tagName)) return;
    e.preventDefault();
    void runCapture();
  }

  function onFsChange(): void {
    isFullscreen = !!document.fullscreenElement;
  }

  onMount(() => {
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
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  });

  // Persist settings whenever they change.
  $effect(() => {
    void [
      settings.theme,
      settings.mirror,
      settings.sound,
      settings.flash,
      settings.mode,
      settings.countdown,
      settings.effect,
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
    <div class="spacer"></div>
    <div class="winbtns"><i>–</i><i>▢</i><i>✕</i></div>
  </div>

  <!-- Toolbar -->
  <div class="toolbar">
    <label class="device-pick" title="Choose camera">
      🎥 <span>{currentDeviceLabel}</span>
      {#if camera.devices.length > 1}▾{/if}
      {#if camera.devices.length > 1}
        <select value={camera.deviceId} onchange={onDeviceChange} aria-label="Choose camera">
          {#each camera.devices as device, i (device.deviceId)}
            <option value={device.deviceId}>{device.label || `Camera ${i + 1}`}</option>
          {/each}
        </select>
      {/if}
    </label>

    <div class="spacer"></div>

    <div class="tools">
      <button class="tool" onclick={toggleTheme} title="Light / dark" aria-label="Toggle light or dark mode">
        {settings.theme === 'light' ? '🌙' : '☀'}
      </button>
      <button
        class="tool wide"
        onclick={cycleCountdown}
        title="Countdown timer (before the shutter)"
        aria-label="Change countdown timer"
      >
        ⏱ <b>{countdownLabel}</b>
      </button>
      <button
        class="tool"
        onclick={() => (settings.mirror = !settings.mirror)}
        aria-pressed={settings.mirror}
        title="Mirror preview"
        aria-label="Toggle mirror"
      >
        🪞
      </button>
      <button
        class="tool"
        onclick={() => (settings.sound = !settings.sound)}
        aria-pressed={settings.sound}
        title="Shutter sound"
        aria-label="Toggle shutter sound"
      >
        🔊
      </button>
      <button
        class="tool"
        onclick={() => (settings.flash = !settings.flash)}
        aria-pressed={settings.flash}
        title="Flash"
        aria-label="Toggle flash"
      >
        ⚡
      </button>
      <button
        class="tool"
        onclick={toggleFullscreen}
        aria-pressed={isFullscreen}
        title="Fullscreen booth"
        aria-label="Toggle fullscreen"
      >
        ⛶
      </button>
    </div>
  </div>

  <!-- Viewport -->
  <div class="viewport">
    {#if camera.status === 'error'}
      <div class="screen"><Fallback /></div>
    {:else if screen === 'review' && shot}
      <div class="screen">
        <Review
          {shot}
          canEdit={!!frames}
          currentLayout={reviewLayout}
          onRetake={retake}
          onRetakeCell={retakeCell}
          onRelayout={relayout}
          onToast={showToast}
        />
      </div>
    {:else}
      <div class="screen">
        <Booth
          {capturing}
          {countdown}
          {burst}
          hint={retakeHint}
          onCapture={runCapture}
          onMode={setMode}
          onOpenReel={openReelItem}
          {registerVideo}
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
