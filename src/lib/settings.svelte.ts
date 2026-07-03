// Persisted, reactive user settings (theme + capture toggles).
// Uses Svelte 5 runes; mutating `settings.*` updates the UI everywhere.

import { isEffectId, gpuOf, type EffectId } from './effects';

export type Theme = 'light' | 'dark';
export type CaptureMode = 'single' | 'quad';

type SettingsShape = {
  theme: Theme;
  mirror: boolean;
  sound: boolean;
  flash: boolean;
  mode: CaptureMode;
  countdown: number; // seconds before the shutter fires; 0 = off
  effect: EffectId;
  // Per-effect intensity (normalized 0..1) for GPU effects; missing keys fall
  // back to the effect's default. A map so Twirl and Glow remember their own
  // sweet spots instead of sharing one global knob.
  effectIntensity: Partial<Record<EffectId, number>>;
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
  mode: saved.mode === 'single' ? 'single' : 'quad',
  countdown: COUNTDOWNS.includes(saved.countdown as number) ? (saved.countdown as number) : 3,
  effect: isEffectId(saved.effect) ? saved.effect : 'normal',
  effectIntensity: { ...(saved.effectIntensity ?? {}) },
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
