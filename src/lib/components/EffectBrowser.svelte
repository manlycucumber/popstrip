<script lang="ts">
  // The PopStrip effect browser — the scalable replacement for the paged 3×3
  // grid. Effects are grouped into labeled, scrollable categories (Favorites,
  // Color, Stylize, Distort) with a sticky search + chip rail. It shares the
  // one pixi renderer with the rest of the app (exactly one renderLive() per
  // frame), so like the grid it only lives while the effect panel is open.
  //
  // Preview cost is the load-bearing detail: there can be a dozen GPU cells, so
  // a single round-robin renders ONE cell per animation frame, and only cells
  // that are actually on-screen (IntersectionObserver) — plus the hovered and
  // the selected one — are eligible. Off-screen GPU cells simply hold their last
  // painted frame. CSS cells are one cheap <video> each, always live.
  import { onMount } from 'svelte';
  import { browserCategories, effect as effectOf, gpuOf, type EffectId, type FlavorId } from '../effects';
  import { settings, effectIntensity, toggleFavorite } from '../settings.svelte';
  import { cameraStream, cameraVideo } from '../camera.svelte';
  import { ensureGpu, renderLive, hasWebGL } from '../gpu/renderer';

  let { onPick, onClose }: { onPick: (id: EffectId) => void; onClose: () => void } = $props();

  const webgl = hasWebGL();
  const flavor: FlavorId = settings.flavor ?? 'popstrip';

  let query = $state('');

  // A cell is one card. Its key is category-scoped so a favorited effect that
  // also appears in its own category gets its OWN canvas (both animate).
  type Cell = { key: string; id: EffectId; label: string; gpu: boolean };

  const categories = $derived.by(() => {
    const cats = browserCategories(flavor, settings.favorites);
    const s = query.trim().toLowerCase();
    const filtered = s
      ? cats
          .map((c) => ({ label: c.label, ids: c.ids.filter((id) => effectOf(id).label.toLowerCase().includes(s)) }))
          .filter((c) => c.ids.length)
      : cats;
    return filtered.map((c) => ({
      label: c.label,
      cells: c.ids.map((id): Cell => ({ key: c.label + ':' + id, id, label: effectOf(id).label, gpu: !!gpuOf(id) })),
    }));
  });

  const cellCanvas: Record<string, HTMLCanvasElement | null> = {};
  const sectionEls: Record<string, HTMLElement> = {};

  // --- IntersectionObserver gating -----------------------------------------
  // liveKeys = GPU cells currently in view; the render loop reads it each frame.
  let scrollRoot = $state<HTMLElement | null>(null);
  let io: IntersectionObserver | null = null;
  const elToKey = new Map<Element, string>();
  const pending: HTMLElement[] = [];
  const liveKeys = new Set<string>();
  let hoveredKey: string | null = null;

  function observe(node: HTMLElement, key: string) {
    elToKey.set(node, key);
    if (io) io.observe(node);
    else pending.push(node);
    return {
      destroy() {
        io?.unobserve(node);
        elToKey.delete(node);
        liveKeys.delete(key);
      },
    };
  }

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

  // --- Single round-robin GPU preview loop ---------------------------------
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
        // Eligible = on-screen ∪ hovered ∪ selected, among GPU cells with a canvas.
        const cand: Cell[] = [];
        for (const sec of categories) {
          for (const cell of sec.cells) {
            if (!cell.gpu || !cellCanvas[cell.key]) continue;
            if (liveKeys.has(cell.key) || cell.key === hoveredKey || cell.id === settings.effect) cand.push(cell);
          }
        }
        if (cand.length) {
          const cell = cand[rr % cand.length];
          rr++;
          const g = gpuOf(cell.id);
          const canvas = cellCanvas[cell.key];
          if (g && canvas) {
            const s = renderLive(src, g.shaderId, effectIntensity(cell.id), settings.mirror);
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

  onMount(() => {
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = elToKey.get(e.target);
          if (!key) continue;
          if (e.isIntersecting) liveKeys.add(key);
          else liveKeys.delete(key);
        }
      },
      { root: scrollRoot, rootMargin: '120px' },
    );
    for (const n of pending) io.observe(n);
    pending.length = 0;
    return () => {
      io?.disconnect();
      io = null;
    };
  });

  $effect(() => {
    void startLoop();
    return () => {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };
  });

  const isFav = (id: EffectId): boolean => settings.favorites.includes(id);
  function jump(label: string): void {
    sectionEls[label]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
</script>

<div class="fxbrowser" role="group" aria-label="Choose an effect">
  <div class="fxb-bar">
    <input
      class="fxb-search"
      type="search"
      placeholder="Search effects…"
      bind:value={query}
      aria-label="Search effects"
    />
    <button class="fxb-done" onclick={onClose} title="Close effects">Done</button>
  </div>

  {#if categories.length > 1}
    <div class="fxb-chips" aria-label="Jump to a category">
      {#each categories as sec (sec.label)}
        <button class="fxb-chip" onclick={() => jump(sec.label)}>{sec.label}</button>
      {/each}
    </div>
  {/if}

  <div class="fxb-scroll" bind:this={scrollRoot}>
    {#if !categories.length}
      <div class="fxb-empty">No effects match “{query}”.</div>
    {/if}
    {#each categories as sec (sec.label)}
      <section class="fxb-section" bind:this={sectionEls[sec.label]}>
        <h3 class="fxb-h">{sec.label}</h3>
        <div class="fxb-grid">
          {#each sec.cells as cell (cell.key)}
            {@const e = effectOf(cell.id)}
            {#if cell.gpu && !webgl}
              <div class="fxb-cell disabled" title="{cell.label} — needs WebGL">
                <span class="fxb-name">{cell.label}</span>
                <span class="fxb-webgl">needs WebGL</span>
              </div>
            {:else}
              <div class="fxb-cell-wrap">
                <button
                  class="fxb-cell"
                  class:active={settings.effect === cell.id}
                  use:observe={cell.key}
                  onclick={() => onPick(cell.id)}
                  onmouseenter={() => (hoveredKey = cell.key)}
                  onmouseleave={() => {
                    if (hoveredKey === cell.key) hoveredKey = null;
                  }}
                  aria-pressed={settings.effect === cell.id}
                  title={cell.label}
                >
                  {#if cell.gpu}
                    <canvas bind:this={cellCanvas[cell.key]} class="fxb-vid"></canvas>
                  {:else}
                    <!-- svelte-ignore a11y_media_has_caption -->
                    <video use:attach class="fxb-vid" class:mirror={settings.mirror} style:filter={e.css} autoplay playsinline muted
                    ></video>
                  {/if}
                  <span class="fxb-name">{cell.label}</span>
                </button>
                {#if cell.id !== 'normal'}
                  <button
                    class="fxb-fav"
                    class:on={isFav(cell.id)}
                    onclick={() => toggleFavorite(cell.id)}
                    aria-pressed={isFav(cell.id)}
                    title={isFav(cell.id) ? 'Unpin from Favorites' : 'Pin to Favorites'}
                    aria-label={isFav(cell.id) ? `Unpin ${cell.label}` : `Pin ${cell.label} to Favorites`}
                  >{isFav(cell.id) ? '★' : '☆'}</button>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </section>
    {/each}
  </div>
</div>
