<script lang="ts">
  import { camera } from '../camera.svelte';
  import { settings, effectIntensity, setEffectIntensity, type CaptureMode } from '../settings.svelte';
  import { effectCss, effectLabel, isGpu, gpuOf, type EffectId } from '../effects';
  import { ensureGpu, renderLive } from '../gpu/renderer';
  import { canRecord, MAX_CLIP_MS } from '../record';
  import { sampleGifFrame } from '../gif';
  import { ensureSegmenter, segmenterReady, segment, type Mask } from '../segment';
  import { loadBackground, composite } from '../backgrounds';
  import { ensureFaceDetector, faceReady, detectFace } from '../face';
  import { drawAR, ensureOverlayDraw } from '../overlay';
  import { drawFrame } from '../frames';
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

  // Green-screen (PopStrip flavor, photo modes): a chosen backdrop swaps the
  // person onto a scene. Its own preview loop composites over the effect, so it
  // joins the same mutual-exclusion as the others below.
  const bgId = $derived(settings.flavor !== 'photobooth' ? settings.background || 'none' : 'none');
  const bgOn = $derived(bgId !== 'none');
  const bgActive = $derived(bgOn && camera.status === 'live' && !gridOpen && !movieMode);

  // AR face layer (PopStrip flavor): orbiting birds/hearts and/or a face prop
  // (glasses, hats, …). Unlike green-screen it's an ADDITIVE top layer — it never
  // calls renderLive(), so it isn't part of the single-renderer mutual exclusion;
  // it simply draws over whatever base is showing. In photo modes it paints its
  // own transparent overlay canvas; in movie mode it's baked into the recording
  // (paintMovieFrame). arOverlay + faceProp are orthogonal and can stack.
  const arOverlayId = $derived(settings.flavor !== 'photobooth' ? settings.arOverlay || 'none' : 'none');
  const facePropId = $derived(settings.flavor !== 'photobooth' ? settings.faceProp || 'none' : 'none');
  const facePaintId = $derived(settings.flavor !== 'photobooth' ? settings.facePaint || 'none' : 'none');
  const arOn = $derived(arOverlayId !== 'none' || facePropId !== 'none' || facePaintId !== 'none');
  const arActive = $derived(arOn && camera.status === 'live' && !gridOpen && !movieMode);

  // Decorative frame (PopStrip flavor): a border drawn around the picture. Also
  // an additive top layer (no renderLive, no model) — but static, so in photo
  // modes it's a cheap overlay canvas painted once per frame-id change (no rAF
  // loop); in movie mode it's baked into the recording (paintMovieFrame).
  const frameId = $derived(settings.flavor !== 'photobooth' ? settings.frame || 'none' : 'none');
  const frameOn = $derived(frameId !== 'none');
  const frameActive = $derived(frameOn && camera.status === 'live' && !gridOpen && !movieMode);

  // Exactly one pixi renderer + one Sprite feed the whole app, so only ONE loop
  // may call renderLive() per frame. These deriveds are mutually exclusive by
  // construction (movieMode / bgOn split them), and all yield to the grid, which
  // runs its own renderLive loop while open.
  const gpuPreviewActive = $derived(
    gpuActive && camera.status === 'live' && !gridOpen && !movieMode && !bgOn,
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

  // --- Green-screen shared (photo + movie paths) --------------------------
  // Both the photo backdrop preview and the movie recording surface cut the
  // segmented person out of the effected frame and drop them onto a backdrop.
  // The segmentation runs at its own reduced cadence off the pixi path (reusing
  // the last mask between), so a GPU effect's single renderLive() stays the only
  // consumer that frame — the one-consumer invariant holds in every path.
  let bgCanvasEl = $state<HTMLCanvasElement | null>(null);
  let bgGen = 0;
  let bgCtx: CanvasRenderingContext2D | null = null;
  let bgImg: HTMLImageElement | null = null;
  let fgWork: HTMLCanvasElement | null = null;
  let fgWorkCtx: CanvasRenderingContext2D | null = null;
  let segInput: HTMLCanvasElement | null = null;
  let segInputCtx: CanvasRenderingContext2D | null = null;
  let lastMask: Mask | null = null;
  let lastMaskAt = 0;
  const MASK_INTERVAL_MS = 66; // ~15fps segmentation; frames in between reuse the last mask
  const SEG_MAX = 480; // cap the live segmentation input — a finer mask upsamples more smoothly (the model resizes internally, so this is nearly free)

  // Keep the backdrop image loaded for the current id (async, cached).
  $effect(() => {
    const id = bgId;
    const custom = settings.customBackground;
    if (id === 'none') {
      bgImg = null;
      return;
    }
    let alive = true;
    void loadBackground(id, custom).then((img) => {
      if (alive && bgId === id) bgImg = img;
    });
    return () => {
      alive = false;
    };
  });

  // Load the segmenter whenever a backdrop is chosen and the camera is live — in
  // either the photo (bgActive) or the movie path. Kept OUT of the render loops
  // (which only reuse the last mask and never await inference). On a browser
  // without it, drop the backdrop gracefully.
  $effect(() => {
    if (!(bgOn && camera.status === 'live' && !gridOpen)) return;
    let alive = true;
    void ensureSegmenter().then((ok) => {
      if (alive && !ok) {
        fxToast = 'Backgrounds aren’t supported here';
        clearTimeout(fxToastTimer);
        fxToastTimer = setTimeout(() => (fxToast = null), 2000);
        settings.background = 'none';
      }
    });
    return () => {
      alive = false;
    };
  });

  // Load the face detector whenever an AR overlay is chosen and the camera is
  // live — covering both the photo overlay loop and the movie path. On a browser
  // without it, drop the overlay gracefully.
  $effect(() => {
    if (!(arOn && camera.status === 'live' && !gridOpen)) return;
    let alive = true;
    void ensureOverlayDraw(); // warm the painter chunk alongside the detector
    void ensureFaceDetector().then((ok) => {
      if (alive && !ok) {
        fxToast = 'Face effects aren’t supported here';
        clearTimeout(fxToastTimer);
        fxToastTimer = setTimeout(() => (fxToast = null), 2000);
        settings.arOverlay = 'none';
        settings.faceProp = 'none';
        settings.facePaint = 'none';
      }
    });
    return () => {
      alive = false;
    };
  });

  function displaySize(vw: number, vh: number): [number, number] {
    const scale = Math.min(1, 720 / Math.max(vw, vh));
    return [Math.max(2, Math.round(vw * scale)), Math.max(2, Math.round(vh * scale))];
  }

  // The effected + mirrored person frame at ~display resolution (video aspect),
  // as a source + its size. GPU → the pixi output; else a 2D scratch (CSS look,
  // or the raw feed while pixi warms). This holds the sole renderLive() call for
  // a GPU effect in the green-screen paths.
  function buildForeground(): { fg: CanvasImageSource; fw: number; fh: number } | null {
    if (!video || !video.videoWidth) return null;
    const g = gpuOf(settings.effect);
    const src = g ? renderLive(video, g.shaderId, effectIntensity(settings.effect), settings.mirror) : null;
    if (g && src) return { fg: src, fw: src.width, fh: src.height };
    const [dw, dh] = displaySize(video.videoWidth, video.videoHeight);
    if (!fgWork) {
      fgWork = document.createElement('canvas');
      fgWorkCtx = fgWork.getContext('2d');
    }
    if (fgWork.width !== dw || fgWork.height !== dh) {
      fgWork.width = dw;
      fgWork.height = dh;
    }
    const fx = fgWorkCtx;
    if (!fx) return null;
    fx.save();
    fx.filter = 'none';
    if (settings.mirror) {
      fx.translate(dw, 0);
      fx.scale(-1, 1);
    }
    if (!g) fx.filter = effectCss(settings.effect); // CSS look; raw feed while pixi warms
    fx.drawImage(video, 0, 0, dw, dh);
    fx.restore();
    return { fg: fgWork, fw: dw, fh: dh };
  }

  // Refresh the person mask at MASK_INTERVAL_MS cadence, reusing the last one
  // between. Segments a downscaled copy so a high-res webcam doesn't build huge
  // masks 15×/sec (composite scales it back up). NEVER awaits — VIDEO-mode
  // segmentation is synchronous — so it's safe inside the 30fps record loop.
  function refreshMask(now: number): void {
    if (!video || !video.videoWidth) return;
    if (lastMask && now - lastMaskAt < MASK_INTERVAL_MS) return;
    const s = Math.min(1, SEG_MAX / Math.max(video.videoWidth, video.videoHeight));
    const sw = Math.max(2, Math.round(video.videoWidth * s));
    const sh = Math.max(2, Math.round(video.videoHeight * s));
    if (!segInput) {
      segInput = document.createElement('canvas');
      segInputCtx = segInput.getContext('2d');
    }
    if (segInput.width !== sw || segInput.height !== sh) {
      segInput.width = sw;
      segInput.height = sh;
    }
    if (!segInputCtx) return;
    segInputCtx.drawImage(video, 0, 0, sw, sh);
    const m = segment(segInput, now);
    if (m) {
      lastMask = m;
      lastMaskAt = now;
    }
  }

  // --- Movie loop (movie mode, any effect) --------------------------------
  // Paints the current effect, baked in, into the fixed movie canvas every
  // frame — this ONE canvas is both the on-screen preview and what we record,
  // so movie clips are WYSIWYG exactly like photos. With a backdrop chosen it
  // additionally cuts the person out and composites them over the scene, so the
  // recorded clip (and any GIF/boomerang sampled off it) carries the background.
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

    if (bgOn && segmenterReady()) {
      // Green-screen: build the effected fg (one renderLive() for a GPU effect),
      // segment at cadence, composite over the backdrop at fg resolution, then
      // cover-fit that video-aspect result into the fixed 4:3 recording surface —
      // the person stays aligned with their backdrop exactly as in photos.
      const built = buildForeground();
      if (built) {
        const { fg, fw, fh } = built;
        refreshMask(performance.now());
        const frame = lastMask ? composite(fg, fw, fh, lastMask, bgImg, settings.mirror, fw, fh) : fg;
        ctx.save();
        ctx.filter = 'none';
        coverDraw(ctx, frame, fw, fh, W, H);
        ctx.restore();
      }
    } else {
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

    // AR overlay (birds/hearts) baked on top of the recorded frame, so the clip —
    // and any GIF/boomerang sampled off it below — carries the overlay too.
    if (arOn && faceReady()) paintOverlayOnto(ctx, W, H, performance.now());

    // Decorative frame is the outermost layer — baked over everything (effect,
    // background, AR) so the clip and its GIF/boomerang carry the border too.
    if (frameOn) drawFrame(ctx, frameId, W, H);

    // While recording, tap the just-painted frame for a possible GIF/boomerang
    // export. Reads this same canvas (no extra renderLive consumer); the sampler
    // downscales + rate-limits internally, so this is cheap every frame.
    if (recState === 'recording') sampleGifFrame(canvas, performance.now());
  }

  async function startMovieLoop(gen: number): Promise<void> {
    void ensureGpu(); // warm pixi if available; CSS effects don't need it
    if (bgOn) void ensureSegmenter(); // warm the segmenter so recording opens composited
    if (arOn) {
      void ensureFaceDetector(); // warm the detector so overlays record from the first frame
      void ensureOverlayDraw(); // …and the painter chunk
    }
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
      lastMask = null;
    }
    return () => {
      movieGen++;
    };
  });

  // --- Green-screen preview loop (photo modes, PopStrip flavor) ------------
  // The live backdrop preview for photo capture: the same build → segment →
  // composite as the movie path, drawn to its own canvas at foreground
  // resolution (no fixed surface — stills capture at native res).
  function paintGreenFrame(): void {
    const canvas = bgCanvasEl;
    if (!canvas) return;
    const built = buildForeground();
    if (!built) return;
    const { fg, fw, fh } = built;
    refreshMask(performance.now());
    if (canvas.width !== fw || canvas.height !== fh) {
      canvas.width = fw;
      canvas.height = fh;
      bgCtx = canvas.getContext('2d');
    }
    if (!bgCtx) bgCtx = canvas.getContext('2d');
    if (!bgCtx) return;
    if (lastMask) {
      bgCtx.drawImage(composite(fg, fw, fh, lastMask, bgImg, settings.mirror, fw, fh), 0, 0);
    } else {
      bgCtx.drawImage(fg, 0, 0, fw, fh); // no mask yet — show the plain frame, no blank
    }
  }

  function startGreenLoop(gen: number): void {
    void ensureGpu(); // GPU effects still render through pixi; the segmenter warms via its own effect
    const tick = (): void => {
      if (gen !== bgGen) return;
      paintGreenFrame();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  $effect(() => {
    if (bgActive) {
      const gen = ++bgGen;
      startGreenLoop(gen);
    } else {
      bgGen++;
      lastMask = null;
    }
    return () => {
      bgGen++;
    };
  });

  // --- AR overlay (photo preview + baked into movie/photo) -----------------
  // A transparent canvas layered over the feed for the live preview, plus a
  // shared offscreen layer used to bake the overlay into the opaque movie/photo
  // surfaces. Face tracking runs at its own cadence (in face.ts) off the pixi
  // path, so this never adds a renderLive() consumer.
  let arCanvasEl = $state<HTMLCanvasElement | null>(null);
  let arGen = 0;
  let arCtx: CanvasRenderingContext2D | null = null;
  let arLayer: HTMLCanvasElement | null = null;
  let arLayerCtx: CanvasRenderingContext2D | null = null;

  // Bake the overlay onto an OPAQUE target (the movie canvas, or a still): draw
  // it to a transparent offscreen layer — whose head-hole reveals the target's
  // own head beneath — then composite that layer over the target.
  function paintOverlayOnto(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    if (!video) return;
    const anchor = detectFace(video, now);
    if (!arLayer) {
      arLayer = document.createElement('canvas');
      arLayerCtx = arLayer.getContext('2d');
    }
    if (arLayer.width !== W || arLayer.height !== H) {
      arLayer.width = W;
      arLayer.height = H;
    }
    if (!arLayerCtx) return;
    drawAR(arLayerCtx, arOverlayId, facePropId, facePaintId, anchor, now, settings.mirror, W, H);
    ctx.save();
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(arLayer, 0, 0);
    ctx.restore();
  }

  // Live preview: the overlay canvas IS the transparent layer (its head-hole
  // reveals the feed showing through from beneath in the DOM), so we draw
  // straight onto it — no compositing step.
  function paintOverlayFrame(): void {
    const canvas = arCanvasEl;
    if (!canvas || !video || !video.videoWidth) return;
    if (!arCtx) arCtx = canvas.getContext('2d');
    const ctx = arCtx;
    if (!ctx) return;
    const now = performance.now();
    const anchor = detectFace(video, now);
    drawAR(ctx, arOverlayId, facePropId, facePaintId, anchor, now, settings.mirror, canvas.width, canvas.height);
  }

  function startOverlayLoop(gen: number): void {
    void ensureFaceDetector();
    const tick = (): void => {
      if (gen !== arGen) return;
      paintOverlayFrame();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  $effect(() => {
    if (arActive) {
      const gen = ++arGen;
      startOverlayLoop(gen);
    } else {
      arGen++;
    }
    return () => {
      arGen++;
    };
  });

  // --- Frame overlay (photo preview) --------------------------------------
  // The frame is static, so there's no loop: this effect repaints the overlay
  // canvas only when the chosen frame (or the canvas element) changes. In movie
  // mode the recording surface bakes its own frame, so this preview is gated off
  // there (frameActive excludes movieMode).
  let frameCanvasEl = $state<HTMLCanvasElement | null>(null);
  let frameCtx: CanvasRenderingContext2D | null = null;
  $effect(() => {
    const id = frameId; // reactive dep — repaint on change
    const el = frameCanvasEl;
    if (!el) return;
    if (!frameCtx || frameCtx.canvas !== el) frameCtx = el.getContext('2d');
    if (!frameCtx) return;
    frameCtx.clearRect(0, 0, el.width, el.height);
    drawFrame(frameCtx, id, el.width, el.height);
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
    class:mirror={settings.mirror && !gpuActive && !movieMode && !bgActive}
    style:filter={gpuActive || movieMode || bgActive ? 'none' : effectCss(settings.effect)}
    autoplay
    playsinline
    muted
  ></video>
  {#if bgActive}
    <canvas bind:this={bgCanvasEl} class="gpu-feed"></canvas>
  {:else if movieMode}
    <canvas bind:this={movieCanvasEl} class="gpu-feed movie-feed" width={MOVIE_W} height={MOVIE_H}></canvas>
  {:else if gpuActive}
    <canvas bind:this={gpuCanvas} class="gpu-feed"></canvas>
  {/if}
  {#if arActive}
    <!-- AR overlay: a transparent top layer over whatever base is showing. -->
    <canvas bind:this={arCanvasEl} class="gpu-feed ar-feed" width={MOVIE_W} height={MOVIE_H}></canvas>
  {/if}
  {#if frameActive}
    <!-- Decorative frame: the outermost static border over the picture. -->
    <canvas bind:this={frameCanvasEl} class="gpu-feed frame-feed" width={MOVIE_W} height={MOVIE_H}></canvas>
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
