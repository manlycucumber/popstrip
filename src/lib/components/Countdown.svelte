<script lang="ts">
  // The big 3·2·1 digit over the live feed, plus a "2 / 4" badge during a burst.
  let { n, burst }: { n: number | null; burst: string } = $props();
</script>

{#if n !== null}
  <div class="countdown" aria-hidden="true">
    {#key n}
      <span class="digit">{n}</span>
    {/key}
  </div>
{/if}

{#if burst}
  <span class="burst" aria-hidden="true">📸 {burst}</span>
{/if}
