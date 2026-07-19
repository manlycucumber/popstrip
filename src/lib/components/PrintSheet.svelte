<script lang="ts">
  // The off-screen sheet the print stylesheet swaps in for the whole app. It
  // holds just the finished photo and a small flavor-aware caption; @media print
  // (in app.css) hides .app and reveals this, centered on the chosen paper.
  import { printImage } from '../print';

  let { url, caption }: { url: string; caption: string } = $props();
  let img = $state<HTMLImageElement | null>(null);

  // Called imperatively from App via `bind:this` when the user hits Print.
  export async function print(): Promise<void> {
    if (img) await printImage(img);
  }
</script>

<figure class="print-sheet" aria-hidden="true">
  <img bind:this={img} src={url} alt="" />
  <figcaption class="print-cap">{caption}</figcaption>
</figure>
