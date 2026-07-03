// On-device person segmentation for green-screen backgrounds (PopStrip flavor).
//
// Everything runs locally: the ~11 MB MediaPipe vision WASM runtime and the
// ~250 KB Selfie Segmenter model are self-hosted under /mediapipe (the WASM is
// copied from node_modules at build time — see scripts/copy-mediapipe-wasm.mjs —
// and the model is committed), never fetched from a CDN. So the nothing-uploaded
// / works-offline promise holds. The MediaPipe dependency is loaded via a dynamic
// import(), so it only downloads the first time a background is chosen and never
// touches the base bundle.
//
// One ImageSegmenter runs in VIDEO mode (synchronous — the callback fires before
// segmentForVideo returns). The model's confidence-mask polarity (which value
// means "person") is undocumented, so we AUTO-DETECT it from a centre-vs-edge
// test — a centred selfie reads high in the middle, low at the edges — and never
// depend on a fixed convention. This is the one thing a webcam would confirm; the
// heuristic makes it robust without one.

import type { ImageSegmenter, ImageSegmenterResult, MPMask } from '@mediapipe/tasks-vision';

export type Mask = { data: Float32Array; width: number; height: number };

const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/models/selfie_segmenter.tflite';

let segmenter: ImageSegmenter | null = null;
let loading: Promise<boolean> | null = null;
let failed = false;
let lastTs = 0;

/**
 * Lazily load MediaPipe + the model. Idempotent; returns false (once, sticky) if
 * segmentation is unavailable — callers fall back to no background gracefully.
 */
export function ensureSegmenter(): Promise<boolean> {
  if (segmenter) return Promise.resolve(true);
  if (failed) return Promise.resolve(false);
  if (!loading) {
    loading = (async () => {
      try {
        const vision = await import('@mediapipe/tasks-vision');
        const files = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
        segmenter = await vision.ImageSegmenter.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL_PATH },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        return true;
      } catch {
        failed = true;
        return false;
      }
    })();
  }
  return loading;
}

export function segmenterReady(): boolean {
  return !!segmenter;
}

// Orientation is a property of the model, not the frame, so decide it once from a
// confident frame and cache it — stable and cheap thereafter.
let personIndex = -1;
let invert = false;

// Mean mask value in a centred box vs the outer frame — sub-sampled so it's cheap
// even at full mask resolution, and resolution-independent.
function regionMeans(data: Float32Array, w: number, h: number): { center: number; edge: number } {
  let cSum = 0;
  let cN = 0;
  let eSum = 0;
  let eN = 0;
  const cx0 = (w * 0.35) | 0;
  const cx1 = (w * 0.65) | 0;
  const cy0 = (h * 0.25) | 0;
  const cy1 = (h * 0.75) | 0;
  const ex = w * 0.12;
  const ey = h * 0.12;
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / 4096)));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const v = data[y * w + x];
      if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) {
        cSum += v;
        cN++;
      } else if (x < ex || x > w - ex || y < ey || y > h - ey) {
        eSum += v;
        eN++;
      }
    }
  }
  return { center: cN ? cSum / cN : 0, edge: eN ? eSum / eN : 0 };
}

function pickForeground(masks: MPMask[]): Mask | null {
  if (!masks.length) return null;
  if (personIndex < 0 || personIndex >= masks.length) {
    // Choose the mask that's brightest in the centre relative to the edges — the
    // person mask. Works whether the model returns one mask or [bg, person].
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < masks.length; i++) {
      const m = masks[i];
      const { center, edge } = regionMeans(m.getAsFloat32Array(), m.width, m.height);
      const score = center - edge;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    personIndex = best;
    // If even the best mask is darker in the centre, its polarity is flipped.
    invert = bestScore < 0;
  }
  const m = masks[personIndex] ?? masks[0];
  const src = m.getAsFloat32Array();
  const data = new Float32Array(src.length);
  if (invert) {
    for (let i = 0; i < src.length; i++) data[i] = 1 - src[i];
  } else {
    data.set(src);
  }
  return { data, width: m.width, height: m.height };
}

/**
 * Segment `source` and return a foreground (person) confidence mask — 0..1 with
 * 1 = person, auto-oriented. VIDEO mode is synchronous, so the mask is ready when
 * this returns. `ts` must increase monotonically (we nudge it if it doesn't).
 * Returns null if the segmenter isn't ready or a frame fails.
 */
export function segment(source: HTMLVideoElement | HTMLCanvasElement, ts: number): Mask | null {
  if (!segmenter) return null;
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  let out: Mask | null = null;
  try {
    // Callback form: the result (and its masks) is only valid during the
    // callback and is freed automatically afterward, so we copy the data out.
    segmenter.segmentForVideo(source, ts, (result: ImageSegmenterResult) => {
      const masks = result.confidenceMasks;
      if (masks && masks.length) out = pickForeground(masks);
    });
  } catch {
    out = null;
  }
  return out;
}
