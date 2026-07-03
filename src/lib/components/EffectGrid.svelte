<script lang="ts">
  // The live effects grid, Photo-Booth style: 3×3 pages with Normal always in
  // the centre, navigated by arrows + page dots.
  //  • CSS effects (and Normal) → one live <video> per cell, CSS-filtered.
  //  • GPU effects → a single shared pixi renderer round-robins one cell per
  //    animation frame into that cell's thumbnail <canvas>, fed by the one
  //    shared camera <video> (cameraVideo()). Only the *current page's* GPU
  //    cells are rendered, so paging keeps the live-render count low.
  // Without WebGL, pages that are all-GPU are dropped and any remaining GPU
  // cells render as disabled placeholders; the CSS effects always work.
  import { EFFECT_PAGES, effect as effectOf, gpuOf, type EffectId } from '../effects';
  import { settings, effectIntensity } from '../settings.svelte';
  import { cameraStream, cameraVideo } from '../camera.svelte';
  import { ensureGpu, renderLive, hasWebGL } from '../gpu/renderer';

  let { onPick }: { onPick: (id: EffectId) => void } = $props();

  const webgl = hasWebGL();
  const pages = webgl
    ? EFFECT_PAGES
    : EFFECT_PAGES.filter((pg) => pg.cells.some((id) => id && id !== 'normal' && effectOf(id).kind === 'css'));

  // Open on the page that holds the active effect.
  let page = $state(Math.max(0, pages.findIndex((pg) => pg.cells.includes(settings.effect))));

  const cellCanvas: Record<string, HTMLCanvasElement> = {};

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

  function coverDraw(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, dw: number, dh: number): void {
    const scale = Math.max(dw / src.width, dh / src.height);
    const sw = dw / scale;
    const sh = dh / scale;
    const sx = (src.width - sw) / 2;
    const sy = (src.height - sh) / 2;
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
  }

  let running = false;
  let rafId = 0;
  let rr = 0;

  async function startLoop(): Promise<void> {
    if (running || !webgl) return;
    running = true;
    const ok = await ensureGpu();
    if (!ok) {
      running = false;
      return;
    }
    const tick = (): void => {
      if (!running) return;
      const src = cameraVideo();
      if (src && src.videoWidth) {
        const gpuCells = pages[page].cells.filter((id): id is EffectId => !!id && !!gpuOf(id));
        if (gpuCells.length) {
          const id = gpuCells[rr % gpuCells.length];
          rr++;
          const g = gpuOf(id);
          const canvas = cellCanvas[id];
          if (g && canvas) {
            const s = renderLive(src, g.shaderId, effectIntensity(id), settings.mirror);
            if (s) {
              const w = canvas.clientWidth || 150;
              const h = canvas.clientHeight || 112;
              if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
              }
              const cx = canvas.getContext('2d');
              if (cx) coverDraw(cx, s, w, h);
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  $effect(() => {
    void startLoop();
    return () => {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };
  });

  const canPrev = $derived(page > 0);
  const canNext = $derived(page < pages.length - 1);
  function go(delta: number): void {
    page = Math.min(pages.length - 1, Math.max(0, page + delta));
    rr = 0;
  }
</script>

<div class="fxgrid" role="group" aria-label="Choose an effect">
  <div class="fxpage">
    {#each pages[page].cells as cell, i (page + ':' + i)}
      {#if cell === null}
        <div class="fxcell empty" aria-hidden="true"></div>
      {:else}
        {@const e = effectOf(cell)}
        {#if e.kind === 'gpu' && !webgl}
          <div class="fxcell disabled" title="{e.label} — needs WebGL">
            <span class="fxname">{e.label}</span>
            <span class="fxwebgl">needs WebGL</span>
          </div>
        {:else}
          <button
            class="fxcell"
            class:active={settings.effect === cell}
            onclick={() => onPick(cell)}
            aria-pressed={settings.effect === cell}
            title={e.label}
          >
            {#if e.kind === 'gpu'}
              <canvas bind:this={cellCanvas[cell]} class="fxvid"></canvas>
            {:else}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video use:attach class="fxvid" class:mirror={settings.mirror} style:filter={e.css} autoplay playsinline muted
              ></video>
            {/if}
            <span class="fxname">{e.label}</span>
          </button>
        {/if}
      {/if}
    {/each}
  </div>

  {#if pages.length > 1}
    <div class="fxnav">
      <button class="fxarrow" onclick={() => go(-1)} disabled={!canPrev} aria-label="Previous effects">‹</button>
      <div class="fxdots">
        {#each pages as pg, i (i)}
          <button
            class="fxdot"
            class:on={i === page}
            onclick={() => {
              page = i;
              rr = 0;
            }}
            aria-label="{pg.label} effects"
            aria-current={i === page}
          ></button>
        {/each}
      </div>
      <button class="fxarrow" onclick={() => go(1)} disabled={!canNext} aria-label="More effects">›</button>
    </div>
  {/if}
</div>
