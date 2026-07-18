// AR family registry + lazy painter loader. This module is EAGER (settings.ts and
// the EffectBrowser import the rosters/guards), but it holds only the lightweight
// ids/labels/glyphs plus a thin loader — all the heavy canvas painting lives in
// ./overlay-draw, which is import()ed on the first AR activation, so the base
// bundle stays free of it. drawAR() here is a synchronous shim that no-ops (just
// clears the layer) until the painter chunk has loaded; callers warm it via
// ensureOverlayDraw() on arOn, and capture paths await it before baking.

import type { FaceAnchor } from './face';

// --- Orbit overlays (Dizzy Birds, Lovestruck) ---------------------------
export type OverlayId = 'none' | 'dizzy' | 'lovestruck';
export type Overlay = { id: OverlayId; label: string; glyph: string };

/** The chooser roster: None, then the AR overlays. */
export const OVERLAYS: Overlay[] = [
  { id: 'none', label: 'None', glyph: '⦸' },
  { id: 'dizzy', label: 'Dizzy Birds', glyph: '🐦' },
  { id: 'lovestruck', label: 'Lovestruck', glyph: '💖' },
];

export function isOverlayId(v: unknown): v is OverlayId {
  return v === 'none' || v === 'dizzy' || v === 'lovestruck';
}

// --- Face props (glasses, hats, a mustache, …) --------------------------
// Static accessories pinned to the face, orthogonal to the orbit overlays; placed
// from canonical face proportions off the same head anchor (no landmark mesh).
export type FacePropId =
  | 'none'
  | 'shades'
  | 'glasses'
  | 'mustache'
  | 'clownnose'
  | 'tophat'
  | 'crown'
  | 'puppy';

export type FaceProp = { id: FacePropId; label: string; glyph: string };

/** The chooser roster: None, then the props (face-level first, then head-toppers). */
export const FACE_PROPS: FaceProp[] = [
  { id: 'none', label: 'None', glyph: '⦸' },
  { id: 'shades', label: 'Shades', glyph: '🕶️' },
  { id: 'glasses', label: 'Glasses', glyph: '👓' },
  { id: 'mustache', label: 'Mustache', glyph: '🥸' },
  { id: 'clownnose', label: 'Clown Nose', glyph: '🤡' },
  { id: 'tophat', label: 'Top Hat', glyph: '🎩' },
  { id: 'crown', label: 'Crown', glyph: '👑' },
  { id: 'puppy', label: 'Puppy', glyph: '🐶' },
];

const FACE_PROP_IDS = FACE_PROPS.map((p) => p.id) as string[];

export function isFacePropId(v: unknown): v is FacePropId {
  return typeof v === 'string' && FACE_PROP_IDS.includes(v);
}

// --- Face paint (painted-on designs) — the third AR family --------------
// Designs painted on the skin (butterfly, tiger, …), orthogonal to overlays and
// props, from the same anchor. Anchor-only: cheeks/forehead/nose regions don't
// need the landmark mesh (a full-mesh version is deferred).
export type FacePaintId =
  | 'none'
  | 'butterfly'
  | 'unicorn'
  | 'tiger'
  | 'kitty'
  | 'superhero'
  | 'rainbow'
  | 'stars';

export type FacePaint = { id: FacePaintId; label: string; glyph: string };

/** The chooser roster: None, then the designs. */
export const FACE_PAINTS: FacePaint[] = [
  { id: 'none', label: 'None', glyph: '⦸' },
  { id: 'butterfly', label: 'Butterfly', glyph: '🦋' },
  { id: 'unicorn', label: 'Unicorn', glyph: '🦄' },
  { id: 'tiger', label: 'Tiger', glyph: '🐯' },
  { id: 'kitty', label: 'Kitty', glyph: '🐱' },
  { id: 'superhero', label: 'Superhero', glyph: '🦸' },
  { id: 'rainbow', label: 'Rainbow', glyph: '🌈' },
  { id: 'stars', label: 'Stars', glyph: '⭐' },
];

const FACE_PAINT_IDS = FACE_PAINTS.map((p) => p.id) as string[];

export function isFacePaintId(v: unknown): v is FacePaintId {
  return typeof v === 'string' && FACE_PAINT_IDS.includes(v);
}

// --- Lazy painter chunk -------------------------------------------------
type OverlayDraw = typeof import('./overlay-draw');
let drawMod: OverlayDraw | null = null;
let drawLoading: Promise<OverlayDraw | null> | null = null;

/**
 * Load the AR painter chunk (idempotent). Warm it on the first AR activation
 * (arOn); capture/movie paths await it so a still or clip bakes correctly.
 * Resolves to null (once, sticky) if the chunk can't load — drawAR then no-ops.
 */
export function ensureOverlayDraw(): Promise<OverlayDraw | null> {
  if (drawMod) return Promise.resolve(drawMod);
  if (!drawLoading) {
    drawLoading = import('./overlay-draw')
      .then((m) => (drawMod = m))
      .catch(() => null);
  }
  return drawLoading;
}

export function overlayDrawReady(): boolean {
  return !!drawMod;
}

/**
 * Draw the AR layer. Synchronous (safe in the rAF loop): delegates to the lazily
 * loaded painter chunk, and until it's loaded just CLEARS the layer — so the live
 * preview shows no overlay for the frame or two while it warms (like the face
 * detector), and no stale layer is ever composited. Callers that must bake
 * (capture, movie) await ensureOverlayDraw() first so this never no-ops for them.
 */
export function drawAR(
  ctx: CanvasRenderingContext2D,
  overlayId: OverlayId,
  propId: FacePropId,
  facePaintId: FacePaintId,
  anchor: FaceAnchor | null,
  tMs: number,
  mirror: boolean,
  W: number,
  H: number,
): void {
  if (drawMod) {
    drawMod.drawAR(ctx, overlayId, propId, facePaintId, anchor, tMs, mirror, W, H);
  } else {
    ctx.clearRect(0, 0, W, H);
  }
}
