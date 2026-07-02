<script lang="ts">
  import { camera } from '../camera.svelte';
  import { settings } from '../settings.svelte';
  import Countdown from './Countdown.svelte';
  import Reel from './Reel.svelte';

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

  $effect(() => {
    if (video) registerVideo(video);
  });

  const shutterLabel = $derived(settings.mode === 'quad' ? 'Take four photos (Space)' : 'Take a photo (Space)');
</script>

<div class="feed-wrap">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video bind:this={video} class="feed" class:mirror={settings.mirror} autoplay playsinline muted></video>
  {#if camera.status === 'live'}
    <span class="live">LIVE</span>
  {:else if camera.status === 'requesting'}
    <div class="requesting">Starting camera…</div>
  {/if}
  {#if hint}
    <div class="hint">{hint}</div>
  {/if}
  <Countdown n={countdown} {burst} />
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

  <button class="fx-btn" disabled title="Effects arrive in v0.3">✨ Effects <span class="soon">v0.3</span></button>
</div>

<Reel onOpen={onOpenReel} />
