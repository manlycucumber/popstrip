// Printing a finished capture on paper. No backend and no popup window — we drop
// the composed photo into a hidden print sheet in the DOM (see PrintSheet.svelte)
// and hand off to the browser's own print dialog, so it works offline, survives
// the service worker, and never trips a popup blocker.

export type PaperSize = 'letter' | 'a4';

// The CSS `size` descriptor's page keywords (case-insensitive, but we use the
// canonical forms). Everything else about the page — the fit, the caption — is
// plain @media print CSS in app.css.
const PAGE_KEYWORD: Record<PaperSize, string> = { letter: 'letter', a4: 'A4' };

export function isPaperSize(v: unknown): v is PaperSize {
  return v === 'letter' || v === 'a4';
}

const PAGE_STYLE_ID = 'ps-print-page';

/**
 * Set the printed paper size. `@page` is an unconditional at-rule — it can't be
 * switched with a selector or a data-attribute — so we keep the rule in a single
 * managed <style> element and rewrite it whenever the choice changes.
 */
export function applyPaperSize(size: PaperSize): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = PAGE_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `@page { size: ${PAGE_KEYWORD[size]} portrait; margin: 12mm; }`;
}

/**
 * Open the print dialog for an already-mounted sheet image. We wait for the image
 * to actually be decoded first: it shares its object URL with the on-screen review
 * <img> so it's normally cached, but on a cold path window.print() can otherwise
 * fire before the bitmap is ready and hand the printer a blank page.
 */
export async function printImage(img: HTMLImageElement): Promise<void> {
  try {
    if (!img.complete || img.naturalWidth === 0) {
      await new Promise<void>((resolve, reject) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => reject(new Error('print image failed to load')), { once: true });
      });
    }
    if (img.decode) {
      try {
        await img.decode();
      } catch {
        /* decode() can reject on some browsers even when the image is fine — print anyway */
      }
    }
  } catch {
    return; // genuinely couldn't load the image — don't print a blank page
  }
  window.print();
}
