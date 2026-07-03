// The effect roster. Two kinds of effect share one registry so the picker and
// the live grid can iterate them uniformly:
//
//  • kind:'css'  — a filter string used both as a CSS `filter` (live <video> +
//    grid) and as canvas `ctx.filter` (baked into the photo). Simple looks are
//    plain CSS functions; Pop Art / Thermal reference an SVG <filter> (FxDefs).
//  • kind:'gpu'  — a WebGL shader (pixi.js) that can't ride on `ctx.filter`:
//    funhouse warps (bulge/dent/twirl/tunnel) and shader stylize (comic/glow/
//    x-ray). Rendered live to a <canvas> and extracted at capture time so the
//    photo is still WYSIWYG. Each carries an `intensity` (normalized 0..1) that
//    a slider drives; the shader maps it to its own physical range.
//
// The 6 CSS effects are unchanged from v0.3.0. GPU effects arrive in v1.0.0.

export type EffectId =
  | 'normal' | 'bw' | 'sepia' | 'pop' | 'thermal' | 'vintage'
  | 'comic' | 'glow' | 'xray'
  | 'bulge' | 'dent' | 'twirl' | 'tunnel';

export type ShaderId = 'comic' | 'glow' | 'xray' | 'bulge' | 'dent' | 'twirl' | 'tunnel';
export type GpuFamily = 'stylize' | 'warp';

export type Intensity = { default: number; min: number; max: number; label: string };

export type CssEffect = { kind: 'css'; id: EffectId; label: string; css: string };
export type GpuEffect = {
  kind: 'gpu';
  id: EffectId;
  label: string;
  css: 'none';
  family: GpuFamily;
  shaderId: ShaderId;
  intensity: Intensity;
};
export type Effect = CssEffect | GpuEffect;

const I = (label: string, def: number): Intensity => ({ default: def, min: 0, max: 1, label });

export const EFFECTS: Effect[] = [
  // --- CSS (verbatim from v0.3.0) ---
  { kind: 'css', id: 'normal', label: 'Normal', css: 'none' },
  { kind: 'css', id: 'bw', label: 'B&W', css: 'grayscale(1) contrast(1.06)' },
  { kind: 'css', id: 'sepia', label: 'Sepia', css: 'sepia(0.85) contrast(1.05) brightness(1.02)' },
  { kind: 'css', id: 'pop', label: 'Pop Art', css: 'url(#ps-pop)' },
  { kind: 'css', id: 'thermal', label: 'Thermal', css: 'url(#ps-thermal)' },
  { kind: 'css', id: 'vintage', label: 'Vintage', css: 'sepia(0.4) contrast(1.15) saturate(1.35) brightness(1.05)' },
  // --- GPU stylize ---
  { kind: 'gpu', id: 'comic', label: 'Comic Book', css: 'none', family: 'stylize', shaderId: 'comic', intensity: I('Ink', 0.6) },
  { kind: 'gpu', id: 'glow', label: 'Dreamy Glow', css: 'none', family: 'stylize', shaderId: 'glow', intensity: I('Glow', 0.55) },
  { kind: 'gpu', id: 'xray', label: 'X-Ray', css: 'none', family: 'stylize', shaderId: 'xray', intensity: I('Exposure', 0.5) },
  // --- GPU warp ---
  { kind: 'gpu', id: 'bulge', label: 'Bulge', css: 'none', family: 'warp', shaderId: 'bulge', intensity: I('Bulge', 0.6) },
  { kind: 'gpu', id: 'dent', label: 'Dent', css: 'none', family: 'warp', shaderId: 'dent', intensity: I('Dent', 0.6) },
  { kind: 'gpu', id: 'twirl', label: 'Twirl', css: 'none', family: 'warp', shaderId: 'twirl', intensity: I('Twist', 0.5) },
  { kind: 'gpu', id: 'tunnel', label: 'Light Tunnel', css: 'none', family: 'warp', shaderId: 'tunnel', intensity: I('Tunnel', 0.6) },
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
