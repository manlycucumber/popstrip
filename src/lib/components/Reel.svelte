<script lang="ts">
  // The bottom photo tray: recent captures, newest first. Click one to reopen it.
  import { reel, removeCapture } from '../history.svelte';

  let { onOpen }: { onOpen: (id: number) => void } = $props();

  function badge(kind: string): string {
    return kind === 'quad' ? '▦' : kind === 'strip' ? '▤' : '';
  }
</script>

{#if reel.items.length}
  <div class="reel" aria-label="Recent captures">
    {#each reel.items as item (item.id)}
      <div class="reel-item">
        <button class="reel-open" onclick={() => onOpen(item.id)} title="Open this capture" aria-label="Open a recent capture">
          <img src={item.thumbUrl} alt="A recent PopStrip capture" />
          {#if item.media === 'video'}
            <span class="tag play">▶</span>
          {:else if badge(item.kind)}
            <span class="tag">{badge(item.kind)}</span>
          {/if}
        </button>
        <button class="reel-del" onclick={() => removeCapture(item.id)} title="Remove from reel" aria-label="Remove from reel">✕</button>
      </div>
    {/each}
  </div>
{/if}
