// Persisted, reactive user settings (theme + capture toggles).
// Uses Svelte 5 runes; mutating `settings.*` updates the UI everywhere.

export type Theme = 'light' | 'dark';

type SettingsShape = {
  theme: Theme;
  mirror: boolean;
  sound: boolean;
  flash: boolean;
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

export const settings = $state<SettingsShape>({
  theme: saved.theme ?? (prefersDark() ? 'dark' : 'light'),
  mirror: saved.mirror ?? true,
  sound: saved.sound ?? true,
  flash: saved.flash ?? true,
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
