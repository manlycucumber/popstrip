// The effect roster. Each effect is a filter string usable both as a CSS
// `filter` (live preview + grid) and as a canvas `ctx.filter` (baked into the
// captured photo, so what you see is what you get). Simple looks are plain CSS
// filter functions; Pop Art (posterize) and Thermal (luminance→color LUT) need
// an SVG <filter>, referenced by url(#id) — see FxDefs.svelte.
//
// v0.3.0 ships the colour roster below. The live grid renders whatever's
// registered here, so it grows to the full 3×3 when shader effects land in v1.0.

export type EffectId = 'normal' | 'bw' | 'sepia' | 'pop' | 'thermal' | 'vintage';

export type Effect = {
  id: EffectId;
  label: string;
  css: string;
};

export const EFFECTS: Effect[] = [
  { id: 'normal', label: 'Normal', css: 'none' },
  { id: 'bw', label: 'B&W', css: 'grayscale(1) contrast(1.06)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(0.85) contrast(1.05) brightness(1.02)' },
  { id: 'pop', label: 'Pop Art', css: 'url(#ps-pop)' },
  { id: 'thermal', label: 'Thermal', css: 'url(#ps-thermal)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.4) contrast(1.15) saturate(1.35) brightness(1.05)' },
];

const BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));

export function isEffectId(v: unknown): v is EffectId {
  return typeof v === 'string' && BY_ID.has(v as EffectId);
}

export function effectCss(id: EffectId): string {
  return BY_ID.get(id)?.css ?? 'none';
}

export function effectLabel(id: EffectId): string {
  return BY_ID.get(id)?.label ?? 'Normal';
}
