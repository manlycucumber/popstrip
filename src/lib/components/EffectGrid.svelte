<script lang="ts">
  // The live effects grid: every effect shown on your live face at once.
  //  • CSS effects → one live <video> per cell, CSS-filtered (cheap, exact
  //    parity with the baked capture).
  //  • GPU effects → a single shared pixi renderer round-robins one cell per
  //    animation frame into that cell's thumbnail <canvas>. One hidden <video>
  //    feeds the renderer as the texture source, so we never open ~7 WebGL
  //    contexts (browsers cap at a handful).
  // If there's no WebGL, GPU effects are hidden entirely — the 6 CSS effects
  // always work.
  import { EFFECTS, gpuOf, type EffectId } from '../effects';
  import { settings, effectIntensity } from '../settings.svelte';
  import { cameraStream, cameraVideo } from '../camera.svelte';
  import { ensureGpu, renderLive, hasWebGL } from '../gpu/renderer';

  let { onPick }: { onPick: (id: EffectId) => void } = $props();

  const webgl = hasWebGL();
  const effects = webgl ? EFFECTS : EFFECTS.filter((e) => e.kind === 'css');
  const gpuCells = effects.filter((e) => e.kind === 'gpu');

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
    if (running || gpuCells.length === 0) return;
    running = true;
    const ok = await ensureGpu();
    if (!ok) {
      running = false;
      return;
    }
    const tick = (): void => {
      if (!running) return;
      const gpuSrc = cameraVideo();
      if (gpuSrc && gpuSrc.videoWidth) {
        const cell = gpuCells[rr % gpuCells.length];
        rr++;
        const g = gpuOf(cell.id);
        const canvas = cellCanvas[cell.id];
        if (g && canvas) {
          const src = renderLive(gpuSrc, g.shaderId, effectIntensity(cell.id), settings.mirror);
          if (src) {
            const w = canvas.clientWidth || 160;
            const h = canvas.clientHeight || 120;
            if (canvas.width !== w || canvas.height !== h) {
              canvas.width = w;
              canvas.height = h;
            }
            const cx = canvas.getContext('2d');
            if (cx) coverDraw(cx, src, w, h);
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
</script>

<div class="fxgrid" role="group" aria-label="Choose an effect">
  {#each effects as eff (eff.id)}
    <button
      class="fxcell"
      class:active={settings.effect === eff.id}
      onclick={() => onPick(eff.id)}
      aria-pressed={settings.effect === eff.id}
      title={eff.label}
    >
      {#if eff.kind === 'gpu'}
        <canvas bind:this={cellCanvas[eff.id]} class="fxvid"></canvas>
      {:else}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video use:attach class="fxvid" class:mirror={settings.mirror} style:filter={eff.css} autoplay playsinline muted
        ></video>
      {/if}
      <span class="fxname">{eff.label}</span>
    </button>
  {/each}
</div>
