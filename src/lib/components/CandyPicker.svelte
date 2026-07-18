<script lang="ts">
  // Toolbar candy-color chip for the Photobooth flavor: a gel dot showing the
  // current iMac color that opens a swatch popover. Only rendered when the
  // Photobooth flavor is active (App.svelte). Closes on outside-click or Esc
  // (Esc captured so it beats the app-level key handler), like Controls.
  //
  // Semantics mirror the sibling flavor-pill: a role="group" of toggle buttons
  // (aria-pressed), not a menu — the six swatches are plain Tab stops, so we
  // don't promise arrow-key roving we don't implement. Focus returns to the
  // trigger whenever the popover closes from the keyboard (WCAG 2.4.3).
  import { onMount } from 'svelte';
  import { settings, setCandy } from '../settings.svelte';
  import { CANDIES, type Candy } from '../themes';

  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);
  let trigger = $state<HTMLButtonElement | null>(null);

  const current = $derived(CANDIES.find((c) => c.id === settings.candy) ?? CANDIES[0]);

  function close(restoreFocus: boolean): void {
    open = false;
    if (restoreFocus) trigger?.focus();
  }

  onMount(() => {
    const onDoc = (e: MouseEvent): void => {
      // Mouse dismiss — focus is already elsewhere, so don't force it back.
      if (open && root && !root.contains(e.target as Node)) open = false;
    };
    const onKey = (e: KeyboardEvent): void => {
      if (open && e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener('click', onDoc);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('click', onDoc);
      window.removeEventListener('keydown', onKey, true);
    };
  });

  function pick(id: Candy): void {
    setCandy(id);
    close(true);
  }
</script>

<div class="candy-anchor" bind:this={root}>
  <button
    class="candy-btn"
    class:on={open}
    bind:this={trigger}
    onclick={() => (open ? close(false) : (open = true))}
    aria-haspopup="true"
    aria-expanded={open}
    aria-label={`Booth color — ${current.label}`}
    title={`Booth color — ${current.label}`}
  >
    <!-- Live indicator uses --candy directly so it always matches the applied skin. -->
    <span class="candy-dot"></span>
  </button>
  {#if open}
    <div class="candy-menu" role="group" aria-label="Booth color">
      {#each CANDIES as c (c.id)}
        <button
          class="candy-swatch"
          class:on={c.id === settings.candy}
          aria-pressed={c.id === settings.candy}
          aria-label={c.label}
          title={c.label}
          style="--sw:{c.swatch}"
          onclick={() => pick(c.id)}
        ></button>
      {/each}
    </div>
  {/if}
</div>
