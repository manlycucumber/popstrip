<script lang="ts">
  import { camera } from '../camera.svelte';
  import { settings, effectIntensity, setEffectIntensity, type CaptureMode } from '../settings.svelte';
  import { effectCss, effectLabel, isGpu, gpuOf, type EffectId } from '../effects';
  import { ensureGpu, renderLive } from '../gpu/renderer';
  import { canRecord, MAX_CLIP_MS } from '../record';
  import Countdown from './Countdown.svelte';
  import Reel from './Reel.svelte';
  import EffectGrid from './EffectGrid.svelte';
  import EffectBrowser from './EffectBrowser.svelte';

  let {
    capturing,
    countdown,
    burst,
    hint,
    recState,
    recMs,
    onCapture,
    onMode,
    onOpenReel,
    registerVideo,
    registerMovieCanvas,
    onRecordButton,
    onDiscardRecord,
  }: {
    capturing: boolean;
    countdown: number | null;
    burst: string;
    hint: string;
    recState: 'idle' | 'countdown' | 'recording';
    recMs: number;
    onCapture: () => void;
    onMode: (mode: CaptureMode) => void;
    onOpenReel: (id: number) => void;
    registerVideo: (el: HTMLVideoElement) => void;
    registerMovieCanvas: (el: HTMLCanvasElement) => void;
    onRecordButton: () => void;
    onDiscardRecord: () => void;
  } = $props();

  let video = $state<HTMLVideoElement | null>(null);
  let gpuCanvas = $state<HTMLCanvasElement | null>(null);
  let movieCanvasEl = $state<HTMLCanvasElement | null>(null);
  let gridOpen = $state(false);
  let fxToast = $state<string | null>(null);
  let fxToastTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(fxToastTimer));

  // Fixed 4:3 recording surface — the movie canvas never resizes with the
  // effect (resizing the source of a live captureStream mid-clip is undefined
  // behaviour across browsers), so effects draw *into* this fixed box.
  const MOVIE_W = 960;
  const MOVIE_H = 720;
  const recordable = canRecord();

  $effect(() => {
    if (video) registerVideo(video);
  });
  $effect(() => {
    if (movieCanvasEl) registerMovieCanvas(movieCanvasEl);
  });

  // Never leave the grid covering the feed once a capture/record flow starts —
  // and, crucially, closing the grid re-enables the movie loop so the recording
  // canvas is being painted (not frozen) before captureStream samples it.
  $effect(() => {
    if (capturing || recState !== 'idle') gridOpen = false;
  });

  const gpuActive = $derived(isGpu(settings.effect));
  const movieMode = $derived(settings.mode === 'movie');
  const busy = $derived(capturing || recState !== 'idle');

  // Exactly one pixi renderer + one Sprite feed the whole app, so only ONE loop
  // may call renderLive() per frame. These two deriveds are mutually exclusive
  // by construction (movieMode splits them), and both yield to the grid, which
  // runs its own renderLive loop while open.
  const gpuPreviewActive = $derived(
    gpuActive && camera.status === 'live' && !gridOpen && !movieMode,
  );
  const movieActive = $derived(movieMode && camera.status === 'live' && !gridOpen);

  // --- GPU preview loop (photo modes) -------------------------------------
  // Generation token: every start/stop bumps it, and both the async startup and
  // the tick bail unless they still own the current generation, so rapid
  // toggling can never leave two rAF loops running on the shared renderer.
  let loopGen = 0;
  let ctx2d: CanvasRenderingContext2D | null = null;

  async function startLoop(gen: number): Promise<void> {
    const ok = await ensureGpu();
    if (!ok || gen !== loopGen) return;
    const tick = (): void => {
      if (gen !== loopGen) return;
      const g = gpuOf(settings.effect);
      if (g && video && gpuCanvas) {
        const src = renderLive(video, g.shaderId, effectIntensity(settings.effect), settings.mirror);
        if (src) {
          if (gpuCanvas.width !== src.width || gpuCanvas.height !== src.height) {
            gpuCanvas.width = src.width;
            gpuCanvas.height = src.height;
            ctx2d = gpuCanvas.getContext('2d');
          }
          if (!ctx2d) ctx2d = gpuCanvas.getContext('2d');
          ctx2d?.drawImage(src, 0, 0);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  $effect(() => {
    if (gpuPreviewActive) {
      const gen = ++loopGen;
      void startLoop(gen);
    } else {
      loopGen++;
    }
    return () => {
      loopGen++;
    };
  });

  // --- Movie loop (movie mode, any effect) --------------------------------
  // Paints the current effect, baked in, into the fixed movie canvas every
  // frame — this ONE canvas is both the on-screen preview and what we record,
  // so movie clips are WYSIWYG exactly like photos.
  let movieGen = 0;
  let movieCtx: CanvasRenderingContext2D | null = null;

  function coverDraw(
    ctx: CanvasRenderingContext2D,
    src: CanvasImageSource,
    iw: number,
    ih: number,
    w: number,
    h: number,
  ): void {
    if (!iw || !ih) return;
    const scale = Math.max(w / iw, h / ih);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (iw - sw) / 2;
    const sy = (ih - sh) / 2;
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  }

  function paintMovieFrame(): void {
    const canvas = movieCanvasEl;
    if (!canvas || !video || !video.videoWidth) return;
    if (!movieCtx) movieCtx = canvas.getContext('2d');
    const ctx = movieCtx;
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const g = gpuOf(settings.effect);

    ctx.save();
    ctx.filter = 'none';
    if (g) {
      // renderLive already bakes the shader + mirror; draw it straight.
      const src = renderLive(video, g.shaderId, effectIntensity(settings.effect), settings.mirror);
      if (src) {
        coverDraw(ctx, src, src.width, src.height, W, H);
      } else {
        // pixi not ready this frame — show the raw mirrored feed (no blank frames).
        if (settings.mirror) {
          ctx.translate(W, 0);
          ctx.scale(-1, 1);
        }
        coverDraw(ctx, video, video.videoWidth, video.videoHeight, W, H);
      }
    } else {
      // CSS effect: mirror + ctx.filter, exactly like the photo capture path.
      if (settings.mirror) {
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
      }
      ctx.filter = effectCss(settings.effect);
      coverDraw(ctx, video, video.videoWidth, video.videoHeight, W, H);
    }
    ctx.restore();
  }

  async function startMovieLoop(gen: number): Promise<void> {
    void ensureGpu(); // warm pixi if available; CSS effects don't need it
    const tick = (): void => {
      if (gen !== movieGen) return;
      paintMovieFrame();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  $effect(() => {
    if (movieActive) {
      const gen = ++movieGen;
      void startMovieLoop(gen);
    } else {
      movieGen++;
    }
    return () => {
      movieGen++;
    };
  });

  // --- UI helpers ----------------------------------------------------------
  function pick(id: EffectId): void {
    settings.effect = id;
    gridOpen = false;
    fxToast = effectLabel(id);
    clearTimeout(fxToastTimer);
    fxToastTimer = setTimeout(() => (fxToast = null), 1400);
  }

  function onIntensity(e: Event): void {
    setEffectIntensity(settings.effect, +(e.currentTarget as HTMLInputElement).value);
  }

  function fmt(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const recLabel = $derived(`${fmt(recMs)} / ${fmt(MAX_CLIP_MS)}`);
  const recBtnTitle = $derived(
    recState === 'recording'
      ? 'Stop recording (Space)'
      : recState === 'countdown'
        ? 'Cancel (Esc)'
        : 'Record a movie (Space)',
  );
  const shutterLabel = $derived(settings.mode === 'quad' ? 'Take four photos (Space)' : 'Take a photo (Space)');
</script>

<div class="feed-outer">
<div class="feed-wrap">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={video}
    class="feed"
    class:mirror={settings.mirror && !gpuActive && !movieMode}
    style:filter={gpuActive || movieMode ? 'none' : effectCss(settings.effect)}
    autoplay
    playsinline
    muted
  ></video>
  {#if movieMode}
    <canvas bind:this={movieCanvasEl} class="gpu-feed movie-feed" width={MOVIE_W} height={MOVIE_H}></canvas>
  {:else if gpuActive}
    <canvas bind:this={gpuCanvas} class="gpu-feed"></canvas>
  {/if}
  {#if recState === 'recording'}
    <div class="recstate"><span class="recdot"></span> REC <span class="rectime">{recLabel}</span></div>
  {:else if camera.status === 'live'}
    <span class="live">LIVE</span>
  {:else if camera.status === 'requesting'}
    <div class="requesting">Starting camera…</div>
  {/if}
  {#if hint}
    <div class="hint">{hint}</div>
  {/if}
  {#if fxToast}
    <div class="nowfx">✦ {fxToast}</div>
  {/if}
  {#if gridOpen && camera.status === 'live'}
    <!-- Photobooth keeps Apple's faithful 3×3 grid; PopStrip gets the scalable
         browser. Both are the sole renderLive consumer while open (gridOpen
         yields Booth's own preview/movie loops), so exclusivity holds either way. -->
    {#if settings.flavor === 'photobooth'}
      <EffectGrid onPick={pick} />
    {:else}
      <EffectBrowser onPick={pick} onClose={() => (gridOpen = false)} />
    {/if}
  {/if}
  <Countdown n={countdown} {burst} />
</div>
</div>

<div class="dock">
  <div class="modes">
    <button aria-pressed={settings.mode === 'single'} onclick={() => onMode('single')} disabled={busy}>
      ▢ <span class="label">Single</span>
    </button>
    <button aria-pressed={settings.mode === 'quad'} onclick={() => onMode('quad')} disabled={busy}>
      ▦ <span class="label">4-up</span>
    </button>
    <button
      aria-pressed={settings.mode === 'movie'}
      onclick={() => onMode('movie')}
      disabled={busy || !recordable}
      title={recordable ? 'Record a movie clip' : 'Recording isn’t supported in this browser'}
    >
      🎬 <span class="label">Movie</span>
    </button>
  </div>

  {#if movieMode}
    <div class="rec-wrap">
      <button
        class="recbtn"
        class:on={recState === 'recording'}
        class:counting={recState === 'countdown'}
        onclick={onRecordButton}
        disabled={camera.status !== 'live'}
        title={recBtnTitle}
        aria-label={recBtnTitle}
      >
        <span class="recmark" class:sq={recState === 'recording'}></span>
      </button>
      {#if recState === 'recording'}
        <button class="rec-discard" onclick={onDiscardRecord} title="Discard clip" aria-label="Discard clip">✕</button>
      {/if}
    </div>
  {:else}
    <button
      class="shutter"
      onclick={onCapture}
      disabled={capturing || camera.status !== 'live'}
      title={shutterLabel}
      aria-label={shutterLabel}
    >
      <span class="ring"></span>
    </button>
  {/if}

  <div class="fx-controls">
    {#if movieMode}
      <button
        class="fx-btn mic"
        class:muted={!settings.mic}
        onclick={() => (settings.mic = !settings.mic)}
        disabled={recState !== 'idle'}
        aria-pressed={settings.mic}
        title={settings.mic ? 'Recording with microphone' : 'Recording without sound'}
      >
        {settings.mic ? '🎙️' : '🔇'} <span class="label">{settings.mic ? 'Mic' : 'Muted'}</span>
      </button>
    {/if}
    {#if gpuActive}
      {@const g = gpuOf(settings.effect)}
      <label class="fx-intensity" title="Effect strength">
        <span class="fx-intensity-name">{g?.intensity.label ?? 'Amount'}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={effectIntensity(settings.effect)}
          oninput={onIntensity}
          disabled={capturing || recState === 'recording'}
          aria-label="Effect strength"
        />
        <span class="fx-intensity-val">{Math.round(effectIntensity(settings.effect) * 100)}%</span>
      </label>
    {/if}
    <button
      class="fx-btn"
      class:on={gridOpen}
      onclick={() => (gridOpen = !gridOpen)}
      disabled={busy || camera.status !== 'live'}
      aria-pressed={gridOpen}
      title="Choose an effect"
    >
      ✨ Effects
    </button>
  </div>
</div>

<Reel onOpen={onOpenReel} />
