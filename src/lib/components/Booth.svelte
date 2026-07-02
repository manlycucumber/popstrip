<script lang="ts">
  import { camera } from '../camera.svelte';
  import { settings } from '../settings.svelte';

  let {
    capturing,
    onCapture,
    registerVideo,
  }: {
    capturing: boolean;
    onCapture: () => void;
    registerVideo: (el: HTMLVideoElement) => void;
  } = $props();

  let video = $state<HTMLVideoElement | null>(null);

  $effect(() => {
    if (video) registerVideo(video);
  });
</script>

<div class="feed-wrap">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video bind:this={video} class="feed" class:mirror={settings.mirror} autoplay playsinline muted></video>
  {#if camera.status === 'live'}
    <span class="live">LIVE</span>
  {:else if camera.status === 'requesting'}
    <div class="requesting">Starting camera…</div>
  {/if}
</div>

<div class="dock">
  <div class="modes">
    <button aria-pressed="true">▢ <span class="label">Single</span></button>
    <button disabled aria-pressed="false">▦ <span class="label">4-up</span> <span class="soon">v0.2</span></button>
    <button disabled aria-pressed="false">🎬 <span class="label">Movie</span> <span class="soon">v2</span></button>
  </div>

  <button
    class="shutter"
    onclick={onCapture}
    disabled={capturing || camera.status !== 'live'}
    title="Take a photo (Space)"
    aria-label="Take a photo"
  >
    <span class="ring"></span>
  </button>

  <button class="fx-btn" disabled title="Effects arrive in v0.3">✨ Effects <span class="soon">v0.3</span></button>
</div>
