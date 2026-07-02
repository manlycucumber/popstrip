// Persisted, reactive user settings (theme + capture toggles).
// Uses Svelte 5 runes; mutating `settings.*` updates the UI everywhere.

import { isEffectId, type EffectId } from './effects';

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
});

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
