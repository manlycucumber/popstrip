// The GPU effect renderer: a lazy pixi.js v8 wrapper shared by the live
// preview, the effects grid, and photo capture. pixi is dynamically imported on
// first use so it lands in its own Vite chunk and never bloats the base bundle
// (the whole CSS-effect app loads without it).
//
// One WebGL renderer + one Sprite wrapping the camera <video> as a texture.
// Every effect is a Filter (pixi's default vertex shader + our fragment from
// shaders.ts) built once and cached. The sprite is scaled to map the *full*
// video frame onto the render target — cropping happens later (CSS object-fit
// for preview, drawCover in strip.ts for the photo), exactly like the CSS path
// draws a full frame and lets compose() crop. So GPU capture stays WYSIWYG.
//
// Mirroring is baked into the render via sprite.scale.x's sign — same visual as
// the CSS path's ctx.scale(-1, 1), and identical between preview and capture.

import type { ShaderId } from '../effects';
import { FRAG_HEADER, FRAGMENTS } from './shaders';

type Pixi = typeof import('pixi.js');
type Renderer = import('pixi.js').Renderer;
type Sprite = import('pixi.js').Sprite;
type Texture = import('pixi.js').Texture;
type Filter = import('pixi.js').Filter;

let pixi: Pixi | null = null;
let renderer: Renderer | null = null;
let sprite: Sprite | null = null;
let texture: Texture | null = null;
const filters = new Map<ShaderId, Filter>();

let boundVideo: HTMLVideoElement | null = null;
let vidW = 0;
let vidH = 0;
let renderW = 0;
let renderH = 0;
let loading: Promise<void> | null = null;

// Cap the live-preview render so a 1080p webcam doesn't render at full res every
// frame — warps depend on aspect, not resolution, so the look is identical.
const DISPLAY_MAX = 720;

/** Cheap synchronous WebGL check — decides whether GPU effects are offered at all. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Build the pixi renderer once (dynamically importing pixi). Idempotent. */
export async function ensureGpu(): Promise<boolean> {
  if (renderer) return true;
  if (!hasWebGL()) return false;
  if (!loading) {
    loading = (async () => {
      const mod = await import('pixi.js');
      pixi = mod;
      renderer = (await mod.autoDetectRenderer({
        preference: 'webgl',
        width: 16,
        height: 16,
        antialias: true,
        backgroundAlpha: 0,
        resolution: 1,
      })) as Renderer;
    })();
  }
  try {
    await loading;
  } catch {
    loading = null;
    return false;
  }
  return !!renderer;
}

export function isReady(): boolean {
  return !!renderer;
}

function buildFilter(id: ShaderId): Filter {
  const glProgram = pixi!.GlProgram.from({
    vertex: pixi!.defaultFilterVert,
    fragment: FRAG_HEADER + FRAGMENTS[id],
    name: `popstrip-${id}`,
  });
  return new pixi!.Filter({
    glProgram,
    resources: {
      warp: new pixi!.UniformGroup({
        uStrength: { value: 0.5, type: 'f32' },
      }),
    },
  });
}

function getFilter(id: ShaderId): Filter {
  let f = filters.get(id);
  if (!f) {
    f = buildFilter(id);
    filters.set(id, f);
  }
  return f;
}

// Ensure the sprite is bound to `video` and knows its current dimensions.
// Returns false while the camera has no frame yet.
//
// One shared camera <video> feeds preview, grid, and capture, so after the first
// bind this just refreshes vidW/vidH. That matters for correctness as much as
// perf: pixi's VideoSource.destroy() PAUSES and clears the underlying element,
// so we must never destroy a texture whose source is the live camera. On a
// device switch the element stays the same (only its stream changes) — pixi's
// VideoSource re-reads frames and resizes on the new stream's metadata, so we
// only update our layout dims and never rebuild.
function ensureSprite(video: HTMLVideoElement): boolean {
  if (!pixi || !renderer) return false;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return false;

  if (sprite && texture && boundVideo === video) {
    vidW = w;
    vidH = h;
    return true;
  }

  // First bind (or a genuinely different element). Any old texture is detached
  // with destroy() (no arg) so the previous element is left playing/untouched.
  if (sprite) {
    sprite.destroy();
    sprite = null;
  }
  if (texture) {
    texture.destroy();
    texture = null;
  }
  texture = pixi.Texture.from(video);
  // Leave updateFPS at its default 0 so updates are driven by the video's own
  // requestVideoFrameCallback rather than a shared Ticker — robust for our bare
  // renderer, which has no Application ticker running.
  const source = texture.source as { autoUpdate?: boolean } | undefined;
  if (source) source.autoUpdate = true;
  sprite = new pixi.Sprite(texture);
  sprite.anchor.set(0.5);
  boundVideo = video;
  vidW = w;
  vidH = h;
  return true;
}

function applyEffect(id: ShaderId, intensity: number): void {
  if (!sprite) return;
  const f = getFilter(id);
  (f.resources as { warp: { uniforms: { uStrength: number } } }).warp.uniforms.uStrength = intensity;
  sprite.filters = [f];
}

// Map the full video frame onto a target of the given size; flip x for mirror.
function layoutSprite(tw: number, th: number, mirror: boolean): void {
  if (!sprite) return;
  sprite.position.set(tw / 2, th / 2);
  const sx = tw / vidW;
  const sy = th / vidH;
  sprite.scale.set(mirror ? -sx : sx, sy);
}

function resizeRenderer(w: number, h: number): void {
  if (!renderer) return;
  if (renderW === w && renderH === h) return;
  renderer.resize(w, h);
  renderW = w;
  renderH = h;
}

/**
 * Render the effect live and return the renderer's canvas (its contents are
 * valid only until the next render — the caller must draw it out synchronously).
 * Returns null until the camera has a frame. Rendered at the full video aspect,
 * capped to DISPLAY_MAX; callers letterbox/cover as needed.
 */
export function renderLive(
  video: HTMLVideoElement,
  shaderId: ShaderId,
  intensity: number,
  mirror: boolean,
): HTMLCanvasElement | null {
  if (!renderer || !pixi) return null;
  if (!ensureSprite(video)) return null;

  const scale = Math.min(1, DISPLAY_MAX / Math.max(vidW, vidH));
  const dw = Math.max(2, Math.round(vidW * scale));
  const dh = Math.max(2, Math.round(vidH * scale));
  resizeRenderer(dw, dh);

  applyEffect(shaderId, intensity);
  layoutSprite(dw, dh, mirror);
  renderer.render(sprite!);
  return renderer.canvas as HTMLCanvasElement;
}

/**
 * Render one frame at the camera's native resolution and return it as an
 * HTMLCanvasElement ready for ctx.drawImage — the capture path. Renders the
 * full frame (uncropped) so compose()'s drawCover crops it identically to the
 * CSS path. Throws if the renderer or camera isn't ready.
 */
export function capture(
  video: HTMLVideoElement,
  shaderId: ShaderId,
  intensity: number,
  mirror: boolean,
): HTMLCanvasElement {
  if (!renderer || !pixi) throw new Error('Effects renderer is not ready yet.');
  if (!ensureSprite(video)) throw new Error('The camera is not ready yet — give it a second and try again.');

  const rt = pixi.RenderTexture.create({ width: vidW, height: vidH, resolution: 1 });
  try {
    applyEffect(shaderId, intensity);
    layoutSprite(vidW, vidH, mirror);
    renderer.render({ container: sprite!, target: rt });
    return renderer.extract.canvas(rt) as HTMLCanvasElement;
  } finally {
    // Always free the framebuffer, even if render/extract throws (context loss).
    rt.destroy(true);
  }
}

/** Full teardown — GPU resources are finite, so dispose everything on camera stop. */
export function destroy(): void {
  for (const f of filters.values()) f.destroy();
  filters.clear();
  if (sprite) {
    sprite.destroy();
    sprite = null;
  }
  if (texture) {
    texture.destroy(true);
    texture = null;
  }
  if (renderer) {
    renderer.destroy();
    renderer = null;
  }
  pixi = null;
  loading = null;
  boundVideo = null;
  vidW = vidH = renderW = renderH = 0;
}
