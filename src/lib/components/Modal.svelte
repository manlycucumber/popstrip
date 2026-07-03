<script lang="ts">
  // A minimal modal: dim backdrop, centered card, focus trap + restore, and Esc
  // — Esc/Tab are captured so Esc beats the app-level key handler (it closes the
  // modal instead of stopping a recording). Close on ✕ / backdrop / Esc.
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  let { onClose, title = 'Dialog', children }: { onClose: () => void; title?: string; children?: Snippet } =
    $props();

  let card = $state<HTMLDivElement | null>(null);

  onMount(() => {
    const prev = document.activeElement as HTMLElement | null;
    queueMicrotask(() => card?.focus());

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && card) {
        const f = card.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        if (active && !card.contains(active)) {
          // focus escaped the card (e.g. it fell to <body>) — pull it back in
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose} role="presentation">
  <div
    class="modal-card"
    bind:this={card}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    onclick={(e) => e.stopPropagation()}
  >
    <button class="modal-close" onclick={onClose} title="Back to the booth" aria-label="Close">✕</button>
    {@render children?.()}
  </div>
</div>
