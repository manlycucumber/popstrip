// GIF / boomerang frame sampling (main thread).
//
// While a movie clip records, Booth's movie loop calls sampleGifFrame() once per
// painted frame. We DON'T open a second renderLive consumer or a second canvas —
// we just read the already-painted 960×720 movie canvas (the single source of
// truth for both preview and recording) and stash a downscaled 480×360 copy.
//
// Frames are held in module state so App can hand them to the encode worker on
// demand (Review's GIF / Boomerang buttons) and free them when the clip is left.
// A 6s cap keeps memory bounded: 90 × 480×360 × 4 bytes ≈ 62 MB transient, all
// released on export/discard/retake — versus ~223 MB if we kept 960×720.

/** GIF output size — a downscale of the fixed movie canvas, cheap to encode/share. */
export const GIF_W = 480;
export const GIF_H = 360;

// Target ~15 fps. The sample gate sits a touch below the exact interval so that
// a 60 Hz rAF loop reliably captures every ~4th frame instead of slipping to
// every 5th; playback delay is the true ~15 fps interval so a GIF runs at about
// real-time (gifenc rounds delay/10 to whole centiseconds).
const GIF_FPS = 15;
const SAMPLE_GATE_MS = 1000 / GIF_FPS - 5;
/** Per-frame playback delay handed to the encoder, in ms. */
export const GIF_DELAY_MS = Math.round(1000 / GIF_FPS);
/** Hard cap on captured frames (~6 s at 15 fps) — the tail of a longer clip is dropped. */
const GIF_MAX_FRAMES = 90;

let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
let frames: ImageData[] = [];
let lastSampleAt = 0;

/** Drop all captured frames and reset the sampler. Frees the transient buffer. */
export function resetGifFrames(): void {
  frames = [];
  lastSampleAt = 0;
}

/**
 * Sample the current movie-canvas frame, downscaled to GIF size, rate-limited to
 * ~15 fps and capped at ~6 s. `now` is a performance.now() timestamp. Cheap and
 * safe to call every frame; it no-ops between samples and once the cap is hit.
 */
export function sampleGifFrame(source: HTMLCanvasElement, now: number): void {
  if (frames.length >= GIF_MAX_FRAMES) return;
  if (now - lastSampleAt < SAMPLE_GATE_MS) return;
  lastSampleAt = now;

  if (!scratch) {
    scratch = document.createElement('canvas');
    scratch.width = GIF_W;
    scratch.height = GIF_H;
    scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
  }
  if (!scratchCtx) return;
  scratchCtx.drawImage(source, 0, 0, GIF_W, GIF_H);
  frames.push(scratchCtx.getImageData(0, 0, GIF_W, GIF_H));
}

/** How many frames are currently buffered (0 ⇒ nothing to export). */
export function gifFrameCount(): number {
  return frames.length;
}

/** The buffered frames' raw RGBA data, for handing to the encode worker. */
export function gifFrameData(): Uint8ClampedArray[] {
  return frames.map((f) => f.data);
}
