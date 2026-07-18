// Candy colors for the Photobooth (iMac G3) flavor. Each theme sets a single
// CSS custom property — `--candy` — on the app root; `app.css` derives the gel
// buttons and the accent chrome from it (via color-mix), so one hue retints the
// whole Aqua skin. Bondi Blue is the original 1998 iMac and the default, so an
// existing booth looks identical until a color is picked.
//
// Orthogonal to [data-mode] (light/dark): the candy is the same hue in either.
// PopStrip flavor keeps its fixed 90s-red identity and ignores --candy entirely.

export type Candy = 'bondi' | 'strawberry' | 'tangerine' | 'lime' | 'blueberry' | 'grape';

export type CandyInfo = {
  id: Candy;
  label: string;
  /** The --candy hue itself — the picker swatch. MUST match the matching
   *  [data-candy] rule in src/app.css (kept in sync by hand). */
  swatch: string;
};

// Order = a color wheel starting from the Bondi default (teal → red → orange →
// green → blue → purple), so the picker reads as the iMac showroom lineup.
export const CANDIES: readonly CandyInfo[] = [
  { id: 'bondi', label: 'Bondi Blue', swatch: '#0095b6' },
  { id: 'strawberry', label: 'Strawberry', swatch: '#e34d6a' },
  { id: 'tangerine', label: 'Tangerine', swatch: '#f0913a' },
  { id: 'lime', label: 'Lime', swatch: '#6bb02f' },
  { id: 'blueberry', label: 'Blueberry', swatch: '#4a6fce' },
  { id: 'grape', label: 'Grape', swatch: '#8a5cb8' },
];

export const DEFAULT_CANDY: Candy = 'bondi';

const IDS: ReadonlySet<string> = new Set(CANDIES.map((c) => c.id));

export function isCandy(v: unknown): v is Candy {
  return typeof v === 'string' && IDS.has(v);
}
