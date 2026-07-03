<script lang="ts">
  // One-time "pick your booth" overlay, shown the first time PopStrip runs (until
  // settings.flavor is set). A deliberate, dismiss-free choice — there's no ✕ or
  // backdrop escape; you pick one, and can switch anytime afterwards from the
  // titlebar pill. Focus is trapped across the two choices for keyboard users.
  import { onMount } from 'svelte';
  import { setFlavor } from '../settings.svelte';
  import type { FlavorId } from '../effects';

  let card = $state<HTMLDivElement | null>(null);

  onMount(() => {
    const prev = document.activeElement as HTMLElement | null;
    queueMicrotask(() => card?.querySelector<HTMLButtonElement>('button')?.focus());
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || !card) return;
      const f = card.querySelectorAll<HTMLElement>('button');
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (active && !card.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  });

  function choose(f: FlavorId): void {
    setFlavor(f);
  }
</script>

<div class="picker-backdrop">
  <div class="picker-card" bind:this={card} role="dialog" aria-modal="true" aria-labelledby="picker-title">
    <h2 class="picker-title" id="picker-title">Pick your booth</h2>
    <p class="picker-sub">Two ways to play. You can switch anytime from the title bar.</p>
    <div class="picker-choices">
      <button class="picker-choice pb" onclick={() => choose('photobooth')}>
        <span class="pc-emoji" aria-hidden="true">📷</span>
        <span class="pc-name">Photobooth</span>
        <span class="pc-desc">The faithful one — Apple's effect roster and the classic 3×3 grid.</span>
      </button>
      <button class="picker-choice ps" onclick={() => choose('popstrip')}>
        <span class="pc-emoji" aria-hidden="true">✨</span>
        <span class="pc-name">PopStrip</span>
        <span class="pc-desc">Ours — every effect, a searchable browser, favorites, room to grow.</span>
      </button>
    </div>
  </div>
</div>
