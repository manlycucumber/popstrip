<script lang="ts">
  import { onMount } from 'svelte';
  import { settings, saveSettings, toggleTheme } from './lib/settings.svelte';
  import { camera, startCamera, switchCamera, bindVideo } from './lib/camera.svelte';
  import { detectSupport } from './lib/support';
  import { captureFrame, type Shot } from './lib/capture';
  import { shutterClick } from './lib/sound';
  import Booth from './lib/components/Booth.svelte';
  import Review from './lib/components/Review.svelte';
  import Fallback from './lib/components/Fallback.svelte';

  const support = detectSupport();

  let screen = $state<'booth' | 'review'>('booth');
  let shot = $state<Shot | null>(null);
  let capturing = $state(false);
  let flashing = $state(false);
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let videoEl: HTMLVideoElement | null = null;
  let isFullscreen = $state(false);

  const currentDeviceLabel = $derived(
    camera.devices.find((d) => d.deviceId === camera.deviceId)?.label || 'Camera',
  );

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

  async function capture(): Promise<void> {
    if (capturing || camera.status !== 'live' || !videoEl) return;
    capturing = true;
    try {
      if (settings.sound) shutterClick();
      doFlash();
      const next = await captureFrame(videoEl, settings.mirror);
      if (shot) URL.revokeObjectURL(shot.url);
      shot = next;
      screen = 'review';
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not take the photo.');
    } finally {
      capturing = false;
    }
  }

  function retake(): void {
    screen = 'booth';
  }

  function onDeviceChange(e: Event): void {
    const id = (e.currentTarget as HTMLSelectElement).value;
    if (id) void switchCamera(id);
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.code !== 'Space' || screen !== 'booth' || camera.status !== 'live') return;
    const t = e.target as HTMLElement | null;
    if (t && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(t.tagName)) return;
    e.preventDefault();
    void capture();
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
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  });

  // Persist settings whenever they change.
  $effect(() => {
    void [settings.theme, settings.mirror, settings.sound, settings.flash];
    saveSettings();
  });

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
      <div class="screen"><Review {shot} onRetake={retake} onToast={showToast} /></div>
    {:else}
      <div class="screen"><Booth {capturing} onCapture={capture} {registerVideo} /></div>
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
</div>
