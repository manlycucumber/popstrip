<script lang="ts">
  // The live effects grid: every registered effect shown on your live face at
  // once. Each cell is its own <video> sharing the single camera stream (no
  // per-frame canvas work), CSS-filtered so it matches the baked capture exactly.
  import { EFFECTS } from '../effects';
  import { settings } from '../settings.svelte';
  import { cameraStream } from '../camera.svelte';

  let { onPick }: { onPick: (id: (typeof EFFECTS)[number]['id']) => void } = $props();

  function attach(node: HTMLVideoElement) {
    const stream = cameraStream();
    if (stream) {
      node.srcObject = stream;
      node.play?.().catch(() => {});
    }
    return {
      destroy() {
        node.srcObject = null;
      },
    };
  }
</script>

<div class="fxgrid" role="group" aria-label="Choose an effect">
  {#each EFFECTS as eff (eff.id)}
    <button
      class="fxcell"
      class:active={settings.effect === eff.id}
      onclick={() => onPick(eff.id)}
      aria-pressed={settings.effect === eff.id}
      title={eff.label}
    >
      <!-- svelte-ignore a11y_media_has_caption -->
      <video use:attach class="fxvid" class:mirror={settings.mirror} style:filter={eff.css} autoplay playsinline muted
      ></video>
      <span class="fxname">{eff.label}</span>
    </button>
  {/each}
</div>
