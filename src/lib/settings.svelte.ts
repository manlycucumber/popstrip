// Persisted, reactive user settings (theme + capture toggles).
// Uses Svelte 5 runes; mutating `settings.*` updates the UI everywhere.

import { isEffectId, gpuOf, inFlavor, type EffectId, type FlavorId } from './effects';

export type Theme = 'light' | 'dark';
export type CaptureMode = 'single' | 'quad' | 'movie';

type SettingsShape = {
  theme: Theme;
  mirror: boolean;
  sound: boolean;
  flash: boolean;
  mode: CaptureMode;
  mic: boolean; // record movie clips with the microphone
  countdown: number; // seconds before the shutter fires; 0 = off
  effect: EffectId;
  // Per-effect intensity (normalized 0..1) for GPU effects; missing keys fall
  // back to the effect's default. A map so Twirl and Glow remember their own
  // sweet spots instead of sharing one global knob.
  effectIntensity: Partial<Record<EffectId, number>>;
  // Which booth "flavor" is active. `undefined` ⇒ the one-time first-run picker
  // hasn't been answered yet. Once chosen it persists and is switchable anytime.
  flavor?: FlavorId;
  // PopStrip-flavor pinned effects, shown first in the effect browser.
  favorites: EffectId[];
  // Green-screen (PopStrip flavor): the chosen backdrop — 'none', a built-in
  // scene id, or 'custom' (the user's uploaded image, held in customBackground
  // as a downscaled on-device data URL). Applies to photos and movie clips.
  background: string;
  customBackground?: string;
};

const KEY = 'popstrip:settings';

function prefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function load(): Partial<SettingsShape> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<SettingsShape>;
  } catch {
    return {};
  }
}

const saved = load();

const COUNTDOWNS = [0, 3, 5, 10];

export const settings = $state<SettingsShape>({
  theme: saved.theme ?? (prefersDark() ? 'dark' : 'light'),
  mirror: saved.mirror ?? true,
  sound: saved.sound ?? true,
  flash: saved.flash ?? true,
  mode: saved.mode === 'single' || saved.mode === 'movie' ? saved.mode : 'quad',
  mic: saved.mic ?? true,
  countdown: COUNTDOWNS.includes(saved.countdown as number) ? (saved.countdown as number) : 3,
  effect: isEffectId(saved.effect) ? saved.effect : 'normal',
  effectIntensity: { ...(saved.effectIntensity ?? {}) },
  flavor: saved.flavor === 'photobooth' || saved.flavor === 'popstrip' ? saved.flavor : undefined,
  favorites: Array.isArray(saved.favorites) ? saved.favorites.filter(isEffectId) : [],
  background: typeof saved.background === 'string' ? saved.background : 'none',
  customBackground: typeof saved.customBackground === 'string' ? saved.customBackground : undefined,
});

/** Current intensity (0..1) for an effect, falling back to its registered default. */
export function effectIntensity(id: EffectId): number {
  const v = settings.effectIntensity[id];
  if (typeof v === 'number') return v;
  return gpuOf(id)?.intensity.default ?? 0.5;
}

/** Set an effect's intensity immutably so the runes proxy sees the change and persists it. */
export function setEffectIntensity(id: EffectId, value: number): void {
  settings.effectIntensity = { ...settings.effectIntensity, [id]: value };
}

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable (private mode / quota) — non-fatal */
  }
}

export function toggleTheme(): void {
  settings.theme = settings.theme === 'light' ? 'dark' : 'light';
  saveSettings();
}

/**
 * Choose a booth flavor (first-run pick or the titlebar switch). If the current
 * effect isn't in the new flavor's roster (e.g. leaving PopStrip while Vintage
 * is active), fall back to Normal — mirrors the WebGL-fallback reset.
 */
export function setFlavor(flavor: FlavorId): void {
  settings.flavor = flavor;
  if (!inFlavor(settings.effect, flavor)) settings.effect = 'normal';
  saveSettings();
}

/** Pin/unpin an effect in the PopStrip effect browser's Favorites row. */
export function toggleFavorite(id: EffectId): void {
  settings.favorites = settings.favorites.includes(id)
    ? settings.favorites.filter((f) => f !== id)
    : [...settings.favorites, id];
  saveSettings();
}
