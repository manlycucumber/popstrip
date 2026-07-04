// On-device face tracking for AR overlays (Dizzy Birds, Lovestruck) — PopStrip.
//
// Like segmentation (segment.ts), everything runs locally: the MediaPipe vision
// WASM runtime is self-hosted under /mediapipe (shared with the segmenter — same
// runtime), and the ~230 KB BlazeFace short-range model is committed under
// /mediapipe/models. Loaded via dynamic import(), so it only downloads the first
// time an AR overlay is chosen and never touches the base bundle.
//
// We use the lightweight FaceDetector (6 keypoints + a box), not the full
// FaceLandmarker (478-point mesh): an orbiting-birds halo only needs the head's
// centre, size, and tilt, and the detector gives those at a fraction of the size
// and cost. Face props that need the mesh (glasses on the nose bridge, a hat on
// the crown) can add the landmarker later — it's lazy and orthogonal.
//
// One FaceDetector runs in VIDEO mode (synchronous — detectForVideo returns the
// result directly). Detection runs at its own reduced cadence; the returned
// anchor is EMA-smoothed so the halo doesn't jitter, and it fades out when the
// face is lost rather than blinking off on a single missed frame.

import type { FaceDetector, FaceDetectorResult, Detection } from '@mediapipe/tasks-vision';

/**
 * Head anchor in normalised (0..1) coordinates, in RAW (un-mirrored) video
 * orientation — the overlay flips it to match a mirrored preview. `size` is the
 * head width as a fraction of the frame; `roll` is the head tilt in radians;
 * `alpha` fades 1→0 as the face goes stale (so a brief detection miss doesn't
 * blink the overlay).
 */
export type FaceAnchor = { cx: number; cy: number; size: number; roll: number; alpha: number };

const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/models/blaze_face_short_range.tflite';

let detector: FaceDetector | null = null;
let loading: Promise<boolean> | null = null;
let failed = false;
let lastTs = 0;

/**
 * Lazily load MediaPipe + the detector. Idempotent; returns false (once, sticky)
 * if face tracking is unavailable — callers fall back to no overlay gracefully.
 */
export function ensureFaceDetector(): Promise<boolean> {
  if (detector) return Promise.resolve(true);
  if (failed) return Promise.resolve(false);
  if (!loading) {
    loading = (async () => {
      try {
        const vision = await import('@mediapipe/tasks-vision');
        const files = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
        detector = await vision.FaceDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL_PATH },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
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

export function faceReady(): boolean {
  return !!detector;
}

// --- Anchor state (smoothed) ---------------------------------------------
// Detection cadence + EMA smoothing live here so every caller (the photo
// overlay loop, the movie loop, and a still capture) shares one tracker.
const DETECT_INTERVAL_MS = 60; // ~16fps detection; the halo animates at 60fps off the smoothed anchor
const EMA = 0.5; // anchor smoothing — higher = snappier, lower = smoother
const FRESH_MS = 150; // full opacity while a face was seen this recently…
const FADE_MS = 650; // …then fade to 0 over this window before it's fully gone
let lastDetectAt = 0;
let lastFaceAt = -Infinity;
let sx = 0.5;
let sy = 0.4;
let ssize = 0.3;
let sroll = 0;
let seeded = false;

/** Drop the tracker history (call when the source stream changes). */
export function resetFaceTracking(): void {
  seeded = false;
  lastFaceAt = -Infinity;
  lastDetectAt = 0;
}

function sourceDims(source: HTMLVideoElement | HTMLCanvasElement): [number, number] {
  return source instanceof HTMLVideoElement
    ? [source.videoWidth, source.videoHeight]
    : [source.width, source.height];
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// Largest detection = the closest / most prominent face (the subject).
function largest(dets: Detection[]): Detection | null {
  let best: Detection | null = null;
  let bestArea = 0;
  for (const d of dets) {
    const b = d.boundingBox;
    const area = b ? b.width * b.height : 0;
    if (area >= bestArea) {
      bestArea = area;
      best = d;
    }
  }
  return best;
}

// BlazeFace keypoint order: [rightEye, leftEye, noseTip, mouth, rightEar, leftEar]
// (normalised 0..1). Head centre = eye midpoint; size = ear-to-ear width (roll-
// invariant, falling back to eye distance); roll = eye-line angle.
function anchorFromDetection(det: Detection): { cx: number; cy: number; size: number; roll: number } | null {
  const k = det.keypoints;
  if (!k || k.length < 4) return null;
  const rEye = k[0];
  const lEye = k[1];
  const cx = (rEye.x + lEye.x) / 2;
  const cy = (rEye.y + lEye.y) / 2;
  const eyeDist = dist(rEye.x, rEye.y, lEye.x, lEye.y);
  const earDist = k.length >= 6 ? dist(k[4].x, k[4].y, k[5].x, k[5].y) : 0;
  const size = Math.max(earDist, eyeDist * 2.2, 0.06);
  const roll = Math.atan2(lEye.y - rEye.y, lEye.x - rEye.x);
  return { cx, cy, size, roll };
}

/**
 * Detect (at cadence) and return the current smoothed head anchor, or null if no
 * face has ever been seen. VIDEO mode is synchronous, so the result is ready on
 * return. `ts` must increase monotonically (we nudge it if it doesn't). Safe to
 * call every frame — it only runs inference every DETECT_INTERVAL_MS and reuses
 * the smoothed anchor in between.
 */
export function detectFace(source: HTMLVideoElement | HTMLCanvasElement, ts: number): FaceAnchor | null {
  if (!detector) return null;
  const [sw, sh] = sourceDims(source);
  if (!sw || !sh) return currentAnchor(ts);

  if (ts - lastDetectAt >= DETECT_INTERVAL_MS) {
    lastDetectAt = ts;
    let tstamp = ts;
    if (tstamp <= lastTs) tstamp = lastTs + 1;
    lastTs = tstamp;
    try {
      const res: FaceDetectorResult = detector.detectForVideo(source, tstamp);
      const det = res.detections && res.detections.length ? largest(res.detections) : null;
      const a = det ? anchorFromDetection(det) : null;
      if (a) {
        if (!seeded) {
          sx = a.cx;
          sy = a.cy;
          ssize = a.size;
          sroll = a.roll;
          seeded = true;
        } else {
          sx += EMA * (a.cx - sx);
          sy += EMA * (a.cy - sy);
          ssize += EMA * (a.size - ssize);
          sroll += EMA * (a.roll - sroll);
        }
        lastFaceAt = ts;
      }
    } catch {
      /* a bad frame — keep the last anchor */
    }
  }
  return currentAnchor(ts);
}

/** The last smoothed anchor with a freshness alpha, or null if never seen. */
export function currentAnchor(ts: number): FaceAnchor | null {
  if (!seeded) return null;
  const age = ts - lastFaceAt;
  const alpha = age <= FRESH_MS ? 1 : age >= FRESH_MS + FADE_MS ? 0 : 1 - (age - FRESH_MS) / FADE_MS;
  if (alpha <= 0) return null;
  return { cx: sx, cy: sy, size: ssize, roll: sroll, alpha };
}
