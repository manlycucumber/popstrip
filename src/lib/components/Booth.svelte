<script lang="ts">
  import { camera } from '../camera.svelte';
  import { settings, effectIntensity, setEffectIntensity } from '../settings.svelte';
  import { effectCss, effectLabel, isGpu, gpuOf, type EffectId } from '../effects';
  import { ensureGpu, renderLive } from '../gpu/renderer';
  import Countdown from './Countdown.svelte';
  import Reel from './Reel.svelte';
  import EffectGrid from './EffectGrid.svelte';

  let {
    capturing,
    countdown,
    burst,
    hint,
    onCapture,
    onMode,
    onOpenReel,
    registerVideo,
  }: {
    capturing: boolean;
    countdown: number | null;
    burst: string;
    hint: string;
    onCapture: () => void;
    onMode: (mode: 'single' | 'quad') => void;
    onOpenReel: (id: number) => void;
    registerVideo: (el: HTMLVideoElement) => void;
  } = $props();

  let video = $state<HTMLVideoElement | null>(null);
  let gpuCanvas = $state<HTMLCanvasElement | null>(null);
  let gridOpen = $state(false);

  $effect(() => {
    if (video) registerVideo(video);
  });

  // Never leave the grid covering the feed once a capture starts.
  $effect(() => {
    if (capturing) gridOpen = false;
  });

  const gpuActive = $derived(isGpu(settings.effect));

  // The GPU preview loop runs only while a GPU effect is active, the camera is
  // live, and the grid is closed — the grid runs its own loop on the same shared
  // renderer, so the two must never render at once. Deriving `active` means
  // switching between two GPU effects doesn't restart the loop (the tick reads
  // the current effect each frame).
  const active = $derived(gpuActive && camera.status === 'live' && !gridOpen);

  // A generation token: every start/stop bumps it, and both the async startup
  // and the tick bail unless they still own the current generation. This makes
  // the loop overlap-proof even though startLoop awaits the pixi import — rapid
  // toggling can never leave two rAF loops running.
  let loopGen = 0;
  let ctx2d: CanvasRenderingContext2D | null = null;

  async function startLoop(gen: number): Promise<void> {
    const ok = await ensureGpu();
    if (!ok || gen !== loopGen) return;
    const tick = (): void => {
      if (gen !== loopGen) return;
      const g = gpuOf(settings.effect);
      if (g && video && gpuCanvas) {
        const src = renderLive(video, g.shaderId, effectIntensity(settings.effect), settings.mirror);
        if (src) {
          if (gpuCanvas.width !== src.width || gpuCanvas.height !== src.height) {
            gpuCanvas.width = src.width;
            gpuCanvas.height = src.height;
            ctx2d = gpuCanvas.getContext('2d');
          }
          if (!ctx2d) ctx2d = gpuCanvas.getContext('2d');
          ctx2d?.drawImage(src, 0, 0);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  $effect(() => {
    if (active) {
      const gen = ++loopGen;
      void startLoop(gen);
    } else {
      loopGen++;
    }
    return () => {
      loopGen++;
    };
  });

  function pick(id: EffectId): void {
    settings.effect = id;
    gridOpen = false;
  }

  function onIntensity(e: Event): void {
    setEffectIntensity(settings.effect, +(e.currentTarget as HTMLInputElement).value);
  }

  const shutterLabel = $derived(settings.mode === 'quad' ? 'Take four photos (Space)' : 'Take a photo (Space)');
</script>

<div class="feed-outer">
<div class="feed-wrap">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={video}
    class="feed"
    class:mirror={settings.mirror && !gpuActive}
    style:filter={gpuActive ? 'none' : effectCss(settings.effect)}
    autoplay
    playsinline
    muted
  ></video>
  {#if gpuActive}
    <canvas bind:this={gpuCanvas} class="gpu-feed"></canvas>
  {/if}
  {#if camera.status === 'live'}
    <span class="live">LIVE</span>
  {:else if camera.status === 'requesting'}
    <div class="requesting">Starting camera…</div>
  {/if}
  {#if hint}
    <div class="hint">{hint}</div>
  {/if}
  {#if gridOpen && camera.status === 'live'}
    <EffectGrid onPick={pick} />
  {/if}
  <Countdown n={countdown} {burst} />
</div>
</div>

<div class="dock">
  <div class="modes">
    <button aria-pressed={settings.mode === 'single'} onclick={() => onMode('single')} disabled={capturing}>
      ▢ <span class="label">Single</span>
    </button>
    <button aria-pressed={settings.mode === 'quad'} onclick={() => onMode('quad')} disabled={capturing}>
      ▦ <span class="label">4-up</span>
    </button>
    <button disabled aria-pressed="false">🎬 <span class="label">Movie</span> <span class="soon">v2</span></button>
  </div>

  <button
    class="shutter"
    onclick={onCapture}
    disabled={capturing || camera.status !== 'live'}
    title={shutterLabel}
    aria-label={shutterLabel}
  >
    <span class="ring"></span>
  </button>

  <div class="fx-controls">
    {#if gpuActive}
      {@const g = gpuOf(settings.effect)}
      <label class="fx-intensity" title="Effect strength">
        <span class="fx-intensity-name">{g?.intensity.label ?? 'Amount'}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={effectIntensity(settings.effect)}
          oninput={onIntensity}
          disabled={capturing}
          aria-label="Effect strength"
        />
      </label>
    {/if}
    <button
      class="fx-btn"
      class:on={gridOpen}
      onclick={() => (gridOpen = !gridOpen)}
      disabled={capturing || camera.status !== 'live'}
      aria-pressed={gridOpen}
      title="Choose an effect"
    >
      ✨ {effectLabel(settings.effect)}
    </button>
  </div>
</div>

<Reel onOpen={onOpenReel} />
