// Green-screen backgrounds: the built-in scenes, custom-upload plumbing, and the
// 2D compositor that drops the segmented person onto a chosen backdrop.
//
// Compositing runs OFF the pixi path (plain 2D canvas) as a post-effect step, so
// it is never a second consumer of the single shared renderLive(): the person
// frame handed in has already had the effect + mirror baked in. The mask arrives
// in raw (un-mirrored) video orientation, so we mirror it here to line it up.

import type { Mask } from './segment';

export type Background = { id: string; label: string };

// Built-in scenes as inline SVG data URIs — crisp at any size, a few hundred
// bytes each, no external assets (keeps offline + nothing-uploaded intact).
// Authored at 1280×960 (4:3) so cover-fit and naturalWidth/Height behave.
const SCENES: Array<{ id: string; label: string; svg: string }> = [
  {
    id: 'chroma',
    label: 'Green screen',
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='960'><rect width='1280' height='960' fill='#00b140'/></svg>`,
  },
  {
    id: 'sunset',
    label: 'Sunset',
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='960'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2a1a5e'/><stop offset='0.45' stop-color='#ff6b6b'/><stop offset='0.72' stop-color='#ffb36b'/><stop offset='1' stop-color='#ffe6b0'/></linearGradient></defs><rect width='1280' height='960' fill='url(#g)'/><circle cx='640' cy='640' r='150' fill='#fff3c4' opacity='0.9'/></svg>`,
  },
  {
    id: 'beach',
    label: 'Beach',
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='960'><defs><linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#6ec6ff'/><stop offset='1' stop-color='#d4f1fd'/></linearGradient><linearGradient id='sea' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1e88e5'/><stop offset='1' stop-color='#4fc3f7'/></linearGradient></defs><rect width='1280' height='620' fill='url(#sky)'/><circle cx='1050' cy='170' r='86' fill='#fff59d'/><rect y='560' width='1280' height='190' fill='url(#sea)'/><rect y='742' width='1280' height='218' fill='#f4e2b0'/></svg>`,
  },
  {
    id: 'space',
    label: 'Space',
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='960'><defs><radialGradient id='sp' cx='0.5' cy='0.4' r='0.85'><stop offset='0' stop-color='#20204a'/><stop offset='1' stop-color='#05050f'/></radialGradient></defs><rect width='1280' height='960' fill='url(#sp)'/><g fill='#fff'><circle cx='120' cy='140' r='3'/><circle cx='300' cy='80' r='2'/><circle cx='520' cy='210' r='2.5'/><circle cx='800' cy='120' r='2'/><circle cx='1010' cy='260' r='3'/><circle cx='1160' cy='90' r='2'/><circle cx='210' cy='420' r='2'/><circle cx='660' cy='340' r='2.5'/><circle cx='1090' cy='520' r='2'/><circle cx='410' cy='640' r='2'/><circle cx='910' cy='700' r='2.5'/><circle cx='160' cy='800' r='2'/></g><circle cx='980' cy='770' r='120' fill='#7e57c2' opacity='0.85'/></svg>`,
  },
  {
    id: 'studio',
    label: 'Studio',
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='960'><defs><radialGradient id='st' cx='0.5' cy='0.42' r='0.78'><stop offset='0' stop-color='#ececf1'/><stop offset='1' stop-color='#8a8a93'/></radialGradient></defs><rect width='1280' height='960' fill='url(#st)'/></svg>`,
  },
  {
    id: 'party',
    label: 'Party',
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='960'><defs><linearGradient id='pt' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ff5ea2'/><stop offset='0.5' stop-color='#ffd24c'/><stop offset='1' stop-color='#4cd4ff'/></linearGradient></defs><rect width='1280' height='960' fill='url(#pt)'/><g><rect x='150' y='120' width='28' height='14' fill='#fff' transform='rotate(20 164 127)'/><rect x='420' y='80' width='24' height='12' fill='#ff3b6b' transform='rotate(-25 432 86)'/><rect x='760' y='150' width='26' height='13' fill='#2b34d6' transform='rotate(40 773 156)'/><rect x='1040' y='90' width='24' height='12' fill='#12cfda' transform='rotate(-15 1052 96)'/><rect x='250' y='420' width='26' height='13' fill='#8fd92e' transform='rotate(30 263 426)'/><rect x='980' y='470' width='24' height='12' fill='#fff' transform='rotate(-35 992 476)'/><rect x='560' y='700' width='26' height='13' fill='#ff3b6b' transform='rotate(15 573 706)'/><rect x='180' y='780' width='24' height='12' fill='#2b34d6' transform='rotate(-20 192 786)'/></g></svg>`,
  },
];

/** The chooser roster: None, then the built-in scenes. (Custom + Upload are UI-only.) */
export const BACKGROUNDS: Background[] = [
  { id: 'none', label: 'None' },
  ...SCENES.map((s) => ({ id: s.id, label: s.label })),
];

function svgToDataUri(svg: string): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/** Preview/source data URI for a built-in scene id, or '' if not a scene. */
export function sceneDataUri(id: string): string {
  const s = SCENES.find((x) => x.id === id);
  return s ? svgToDataUri(s.svg) : '';
}

function resolveSrc(id: string, customUrl?: string): string | null {
  if (!id || id === 'none') return null;
  if (id === 'custom') return customUrl || null;
  return sceneDataUri(id) || null;
}

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

/** Load (and cache) the background image for an id. Resolves null for 'none'/unknown. */
export function loadBackground(id: string, customUrl?: string): Promise<HTMLImageElement | null> {
  const src = resolveSrc(id, customUrl);
  return src ? loadImage(src) : Promise.resolve(null);
}

/** Read a user file, downscale to `maxW` wide, and return a JPEG data URL (kept small for localStorage). */
export function fileToDataUrl(file: File, maxW = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
        const w = Math.max(1, Math.round((img.naturalWidth || maxW) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || maxW) * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('no ctx');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.85));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('image'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

// --- Compositor ----------------------------------------------------------
// Reused scratch canvases so the per-frame live path allocates nothing.
let workC: HTMLCanvasElement | null = null;
let workCtx: CanvasRenderingContext2D | null = null;
let cutC: HTMLCanvasElement | null = null;
let cutCtx: CanvasRenderingContext2D | null = null;
let maskC: HTMLCanvasElement | null = null;
let maskCtx: CanvasRenderingContext2D | null = null;
let maskImg: ImageData | null = null;
let builtMaskRef: Mask | null = null;

function coverDraw(ctx: CanvasRenderingContext2D, src: CanvasImageSource, iw: number, ih: number, w: number, h: number): void {
  if (!iw || !ih) {
    ctx.drawImage(src, 0, 0, w, h);
    return;
  }
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
}

// Turn the foreground mask into an alpha bitmap once per new mask (not per frame).
function buildMaskCanvas(mask: Mask): HTMLCanvasElement | null {
  if (mask === builtMaskRef && maskC) return maskC;
  const mw = mask.width;
  const mh = mask.height;
  if (!maskC) {
    maskC = document.createElement('canvas');
    maskCtx = maskC.getContext('2d');
  }
  if (!maskCtx) return null;
  if (maskC.width !== mw || maskC.height !== mh || !maskImg) {
    maskC.width = mw;
    maskC.height = mh;
    maskImg = maskCtx.createImageData(mw, mh);
  }
  const px = maskImg.data;
  const src = mask.data;
  // Remap the raw confidence into a cleaner matte instead of a linear ramp:
  // fully transparent below LO (kills the low-confidence background haze/speckle
  // that reads as "rough"), fully opaque above HI (a solid body, no ghosting),
  // with a smoothstep in between for a soft — not jagged — edge.
  const LO = 0.22;
  const HI = 0.55;
  const span = HI - LO;
  for (let i = 0; i < src.length; i++) {
    let t = (src[i] - LO) / span;
    t = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    const j = i << 2;
    px[j] = 255;
    px[j + 1] = 255;
    px[j + 2] = 255;
    px[j + 3] = (t * 255) | 0;
  }
  maskCtx.putImageData(maskImg, 0, 0);
  builtMaskRef = mask;
  return maskC;
}

/**
 * Composite the segmented person over a background. `fg` is the already-effected,
 * already-mirrored person frame; `mask` is foreground confidence (1 = person) in
 * raw video orientation (we mirror it to match `fg`). `bg` may be null → black.
 * Returns a reused canvas at W×H (defaults to the fg size). Untainted (self-
 * contained SVG / same-origin data), so the result stays exportable to a blob.
 */
export function composite(
  fg: CanvasImageSource,
  fgW: number,
  fgH: number,
  mask: Mask,
  bg: HTMLImageElement | null,
  mirror: boolean,
  W = fgW,
  H = fgH,
): HTMLCanvasElement {
  if (!workC) {
    workC = document.createElement('canvas');
    workCtx = workC.getContext('2d');
  }
  if (!cutC) {
    cutC = document.createElement('canvas');
    cutCtx = cutC.getContext('2d');
  }
  const wctx = workCtx;
  const cctx = cutCtx;
  if (!wctx || !cctx) return workC;
  if (workC.width !== W || workC.height !== H) {
    workC.width = W;
    workC.height = H;
  }
  if (cutC.width !== W || cutC.height !== H) {
    cutC.width = W;
    cutC.height = H;
  }
  const maskCanvas = buildMaskCanvas(mask);

  // 1) Cut out the person: draw fg, then keep only where the (mirrored, scaled,
  //    slightly feathered) mask is opaque.
  cctx.save();
  cctx.clearRect(0, 0, W, H);
  cctx.drawImage(fg, 0, 0, W, H);
  if (maskCanvas) {
    cctx.globalCompositeOperation = 'destination-in';
    // Feather scales with the output size so the soft edge looks consistent
    // whether compositing a small live preview or a full-res still (no-op if
    // the browser doesn't support canvas filters).
    cctx.filter = `blur(${Math.max(1.5, W / 380).toFixed(2)}px)`;
    if (mirror) {
      cctx.translate(W, 0);
      cctx.scale(-1, 1);
    }
    cctx.drawImage(maskCanvas, 0, 0, W, H);
  }
  cctx.restore();

  // 2) Background, then the cut-out person on top.
  wctx.clearRect(0, 0, W, H);
  if (bg) coverDraw(wctx, bg, bg.naturalWidth || W, bg.naturalHeight || H, W, H);
  else {
    wctx.fillStyle = '#000';
    wctx.fillRect(0, 0, W, H);
  }
  wctx.drawImage(cutC, 0, 0);
  return workC;
}
