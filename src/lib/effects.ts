// The effect roster. Two kinds of effect share one registry so the picker and
// the live grid can iterate them uniformly:
//
//  • kind:'css'  — a filter string used both as a CSS `filter` (live <video> +
//    grid) and as canvas `ctx.filter` (baked into the photo). Simple looks are
//    plain CSS functions; Pop Art / Thermal reference an SVG <filter> (FxDefs).
//  • kind:'gpu'  — a WebGL shader (pixi.js) that can't ride on `ctx.filter`:
//    funhouse warps and shader stylize. Rendered live to a <canvas> and
//    extracted at capture time so the photo is still WYSIWYG. Each carries an
//    `intensity` (normalized 0..1) that a slider drives; the shader maps it to
//    its own physical range.
//
// Names and the roster mirror macOS Photo Booth. Photo Booth's effects are Core
// Image filters, so each of ours targets a specific CIFilter's look (e.g. Bulge
// ≈ CIBumpDistortion, Twirl ≈ CITwirlDistortion, Comic Book ≈ CIComicEffect).
// The grid is organized into 3×3 pages with Normal always in the centre — see
// EFFECT_PAGES below.

export type EffectId =
  | 'normal' | 'bw' | 'sepia' | 'pop' | 'thermal' | 'vintage'
  | 'comic' | 'glow' | 'xray' | 'pencil'
  | 'bulge' | 'dent' | 'twirl' | 'squeeze' | 'mirror' | 'tunnel' | 'fisheye' | 'stretch';

export type ShaderId =
  | 'comic' | 'glow' | 'xray' | 'pencil'
  | 'bulge' | 'dent' | 'twirl' | 'squeeze' | 'mirror' | 'tunnel' | 'fisheye' | 'stretch';

export type GpuFamily = 'stylize' | 'warp';

// Two booth "flavors" share one effect registry. `collections` (when present)
// limits an effect to certain flavors; omitted ⇒ available in both. The faithful
// Photobooth carries Apple's exact roster (the two 3×3 pages); PopStrip is the
// growing superset, so only PopStrip-original effects (e.g. Vintage) are tagged.
export type FlavorId = 'photobooth' | 'popstrip';

export type Intensity = { default: number; min: number; max: number; label: string };

export type CssEffect = {
  kind: 'css';
  id: EffectId;
  label: string;
  css: string;
  collections?: FlavorId[];
};
export type GpuEffect = {
  kind: 'gpu';
  id: EffectId;
  label: string;
  css: 'none';
  family: GpuFamily;
  shaderId: ShaderId;
  intensity: Intensity;
  collections?: FlavorId[];
};
export type Effect = CssEffect | GpuEffect;

const I = (label: string, def: number): Intensity => ({ default: def, min: 0, max: 1, label });

export const EFFECTS: Effect[] = [
  // --- CSS color effects ---
  { kind: 'css', id: 'normal', label: 'Normal', css: 'none' },
  { kind: 'css', id: 'bw', label: 'Black & White', css: 'grayscale(1) contrast(1.06)' },
  { kind: 'css', id: 'sepia', label: 'Sepia', css: 'sepia(0.85) contrast(1.05) brightness(1.02)' },
  { kind: 'css', id: 'pop', label: 'Pop Art', css: 'url(#ps-pop)' },
  { kind: 'css', id: 'thermal', label: 'Thermal Camera', css: 'url(#ps-thermal)' },
  { kind: 'css', id: 'vintage', label: 'Vintage', css: 'sepia(0.4) contrast(1.15) saturate(1.35) brightness(1.05)', collections: ['popstrip'] },
  // --- GPU stylize ---
  { kind: 'gpu', id: 'comic', label: 'Comic Book', css: 'none', family: 'stylize', shaderId: 'comic', intensity: I('Ink', 0.6) },
  { kind: 'gpu', id: 'glow', label: 'Glow', css: 'none', family: 'stylize', shaderId: 'glow', intensity: I('Glow', 0.55) },
  { kind: 'gpu', id: 'xray', label: 'X-Ray', css: 'none', family: 'stylize', shaderId: 'xray', intensity: I('Exposure', 0.5) },
  { kind: 'gpu', id: 'pencil', label: 'Colored Pencil', css: 'none', family: 'stylize', shaderId: 'pencil', intensity: I('Pencil', 0.6) },
  // --- GPU warps (distortions) ---
  { kind: 'gpu', id: 'bulge', label: 'Bulge', css: 'none', family: 'warp', shaderId: 'bulge', intensity: I('Bulge', 0.6) },
  { kind: 'gpu', id: 'dent', label: 'Dent', css: 'none', family: 'warp', shaderId: 'dent', intensity: I('Dent', 0.7) },
  { kind: 'gpu', id: 'twirl', label: 'Twirl', css: 'none', family: 'warp', shaderId: 'twirl', intensity: I('Twist', 0.6) },
  { kind: 'gpu', id: 'squeeze', label: 'Squeeze', css: 'none', family: 'warp', shaderId: 'squeeze', intensity: I('Squeeze', 0.5) },
  { kind: 'gpu', id: 'mirror', label: 'Mirror', css: 'none', family: 'warp', shaderId: 'mirror', intensity: I('Mirror', 1.0) },
  { kind: 'gpu', id: 'tunnel', label: 'Light Tunnel', css: 'none', family: 'warp', shaderId: 'tunnel', intensity: I('Tunnel', 0.5) },
  { kind: 'gpu', id: 'fisheye', label: 'Fish Eye', css: 'none', family: 'warp', shaderId: 'fisheye', intensity: I('Fisheye', 0.5) },
  { kind: 'gpu', id: 'stretch', label: 'Stretch', css: 'none', family: 'warp', shaderId: 'stretch', intensity: I('Stretch', 0.5) },
];

const BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));

export function isEffectId(v: unknown): v is EffectId {
  return typeof v === 'string' && BY_ID.has(v as EffectId);
}

export function effect(id: EffectId): Effect {
  return BY_ID.get(id) ?? EFFECTS[0];
}

export function effectLabel(id: EffectId): string {
  return effect(id).label;
}

/** CSS filter string for an effect (GPU effects have no CSS equivalent → 'none'). */
export function effectCss(id: EffectId): string {
  const e = effect(id);
  return e.kind === 'css' ? e.css : 'none';
}

export function isGpu(id: EffectId): boolean {
  return effect(id).kind === 'gpu';
}

/** The GPU details for an effect, or null if it's a CSS effect. */
export function gpuOf(id: EffectId): GpuEffect | null {
  const e = effect(id);
  return e.kind === 'gpu' ? e : null;
}

// ---- Flavors: one registry, filtered per booth --------------------------

/** Is this effect available in the given flavor? (untagged ⇒ both.) */
export function inFlavor(id: EffectId, flavor: FlavorId): boolean {
  const c = effect(id).collections;
  return !c || c.includes(flavor);
}

/** The effect ids a flavor exposes, in registry order. */
export function rosterFor(flavor: FlavorId): EffectId[] {
  return EFFECTS.filter((e) => inFlavor(e.id, flavor)).map((e) => e.id);
}

// ---- The PopStrip effect browser: labeled, scrollable categories --------
//
// Unlike the fixed 3×3 Photobooth grid, the PopStrip flavor groups its growing
// roster into scrollable sections (Favorites first, then by kind). Category
// membership is derived from the effect's kind/family, so a new effect slots in
// automatically. `favorites` is passed in (it's user state), filtered to the
// flavor's roster so a favorite that isn't in this flavor is quietly skipped.

export type EffectCategory = { label: string; ids: EffectId[] };

export function browserCategories(flavor: FlavorId, favorites: EffectId[]): EffectCategory[] {
  const roster = new Set(rosterFor(flavor));
  const has = (id: EffectId): boolean => roster.has(id);
  const idsWhere = (pred: (e: Effect) => boolean): EffectId[] =>
    EFFECTS.filter((e) => has(e.id) && pred(e)).map((e) => e.id);

  const cats: EffectCategory[] = [];
  const favs = favorites.filter((id) => isEffectId(id) && has(id));
  if (favs.length) cats.push({ label: 'Favorites', ids: favs });
  cats.push({ label: 'Color', ids: idsWhere((e) => e.kind === 'css') });
  cats.push({ label: 'Stylize', ids: idsWhere((e) => e.kind === 'gpu' && e.family === 'stylize') });
  cats.push({ label: 'Distort', ids: idsWhere((e) => e.kind === 'gpu' && e.family === 'warp') });
  return cats.filter((c) => c.ids.length);
}

// ---- The effects grid, Photo-Booth style: 3×3 pages with Normal centered ----
//
// Each page is exactly 9 cells; index 4 (the centre) is always 'normal'. A cell
// may be null (an empty slot on the extras page — room to grow). The Distort
// page mirrors Photo Booth's distortion page layout exactly.

export type PageCell = EffectId | null;
export type EffectPage = { label: string; cells: PageCell[] };

export const EFFECT_PAGES: EffectPage[] = [
  {
    label: 'Color',
    cells: ['sepia', 'bw', 'glow', 'comic', 'normal', 'pencil', 'thermal', 'xray', 'pop'],
  },
  {
    label: 'Distort',
    cells: ['bulge', 'dent', 'twirl', 'squeeze', 'normal', 'mirror', 'tunnel', 'fisheye', 'stretch'],
  },
  {
    label: 'PopStrip',
    cells: [null, null, null, 'vintage', 'normal', null, null, null, null],
  },
];

/** Index of the page that contains an effect (0 if not found — the Color page). */
export function pageOfEffect(id: EffectId): number {
  const i = EFFECT_PAGES.findIndex((p) => p.cells.includes(id));
  return i >= 0 ? i : 0;
}
