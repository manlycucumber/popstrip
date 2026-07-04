// AR face overlays — the OverlayStage. Face-tracked animated props that orbit
// your head: Dizzy Birds (the daughter's request — the bluebirds from Photo
// Booth's "Dizzy") and Lovestruck (hearts).
//
// This is an ADDITIVE top layer, not a render path: it draws onto a transparent
// canvas that sits over whatever's underneath (the plain feed, a GPU effect, or
// a green-screen composite), so it never calls renderLive() and can't break the
// one-consumer-per-frame rule. The same draw runs for the live preview, baked
// photos, and recorded clips.
//
// Everything is drawn procedurally (no image assets → self-contained, offline,
// crisp at any resolution). Birds on the FAR side of the orbit are drawn first
// and then occluded by a soft head-shaped hole (destination-out), which reveals
// the real head beneath the transparent layer — so they convincingly pass BEHIND
// your head. Near-side birds draw on top.

import type { FaceAnchor } from './face';

export type OverlayId = 'none' | 'dizzy' | 'lovestruck';

export type Overlay = { id: OverlayId; label: string; glyph: string };

/** The chooser roster: None, then the AR overlays. */
export const OVERLAYS: Overlay[] = [
  { id: 'none', label: 'None', glyph: '⦸' },
  { id: 'dizzy', label: 'Dizzy Birds', glyph: '🐦' },
  { id: 'lovestruck', label: 'Lovestruck', glyph: '💖' },
];

export function isOverlayId(v: unknown): v is OverlayId {
  return v === 'none' || v === 'dizzy' || v === 'lovestruck';
}

// Face props are the second AR family: static accessories pinned to the face —
// glasses, hats, a mustache — rather than animated orbiters. They're orthogonal
// to the orbit overlays (you can wear shades AND have birds), and need only the
// same head anchor (centre, size, tilt): every prop is placed from canonical
// face proportions, so no heavier landmark mesh is required.
export type FacePropId =
  | 'none'
  | 'shades'
  | 'glasses'
  | 'mustache'
  | 'clownnose'
  | 'tophat'
  | 'crown'
  | 'puppy';

export type FaceProp = { id: FacePropId; label: string; glyph: string };

/** The chooser roster: None, then the props (face-level first, then head-toppers). */
export const FACE_PROPS: FaceProp[] = [
  { id: 'none', label: 'None', glyph: '⦸' },
  { id: 'shades', label: 'Shades', glyph: '🕶️' },
  { id: 'glasses', label: 'Glasses', glyph: '👓' },
  { id: 'mustache', label: 'Mustache', glyph: '🥸' },
  { id: 'clownnose', label: 'Clown Nose', glyph: '🤡' },
  { id: 'tophat', label: 'Top Hat', glyph: '🎩' },
  { id: 'crown', label: 'Crown', glyph: '👑' },
  { id: 'puppy', label: 'Puppy', glyph: '🐶' },
];

const FACE_PROP_IDS = FACE_PROPS.map((p) => p.id) as string[];

export function isFacePropId(v: unknown): v is FacePropId {
  return typeof v === 'string' && FACE_PROP_IDS.includes(v);
}

// --- Head geometry from the anchor --------------------------------------
type Head = { cx: number; cy: number; w: number; h: number; roll: number };

function headOf(a: FaceAnchor, mirror: boolean, W: number, H: number): Head {
  const cx = (mirror ? 1 - a.cx : a.cx) * W;
  const cy = a.cy * H;
  const w = a.size * W;
  return { cx, cy, w, h: w * 1.35, roll: mirror ? -a.roll : a.roll };
}

// Soft head-shaped hole punched into the layer so far-side props pass behind the
// real head showing through from beneath. A radial gradient gives a feathered
// (not hard) occlusion edge.
function punchHead(ctx: CanvasRenderingContext2D, head: Head): void {
  const ocx = head.cx;
  const ocy = head.cy + head.h * 0.12; // face centre sits a little below the eyes
  const rx = head.w * 0.6;
  const ry = head.h * 0.72;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 1;
  ctx.translate(ocx, ocy);
  ctx.rotate(head.roll);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.82, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- Sprites (drawn in a local frame: origin = centre, facing +x, unit ~ 1px) --
function drawBird(ctx: CanvasRenderingContext2D, s: number, flap: number): void {
  const body = '#2b7fd4';
  const belly = '#bfe3ff';
  const wing = '#1c5fa8';
  // Tail
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.moveTo(-0.7 * s, 0);
  ctx.lineTo(-1.15 * s, -0.35 * s);
  ctx.lineTo(-1.05 * s, 0.28 * s);
  ctx.closePath();
  ctx.fill();
  // Body
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.8 * s, 0.55 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Belly
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(0.1 * s, 0.18 * s, 0.5 * s, 0.32 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0.62 * s, -0.28 * s, 0.34 * s, 0, Math.PI * 2);
  ctx.fill();
  // Beak
  ctx.fillStyle = '#ffb02e';
  ctx.beginPath();
  ctx.moveTo(0.92 * s, -0.3 * s);
  ctx.lineTo(1.28 * s, -0.2 * s);
  ctx.lineTo(0.92 * s, -0.12 * s);
  ctx.closePath();
  ctx.fill();
  // Eye
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0.72 * s, -0.36 * s, 0.11 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#10233a';
  ctx.beginPath();
  ctx.arc(0.75 * s, -0.36 * s, 0.055 * s, 0, Math.PI * 2);
  ctx.fill();
  // Wing — flaps up/down
  ctx.save();
  ctx.translate(-0.02 * s, -0.12 * s);
  ctx.rotate(flap * 0.7);
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-0.28 * s, -0.75 * s, -0.62 * s, -0.5 * s);
  ctx.quadraticCurveTo(-0.32 * s, -0.18 * s, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function heartPath(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, 0.35 * s);
  ctx.bezierCurveTo(-0.5 * s, -0.15 * s, -0.95 * s, 0.35 * s, 0, s);
  ctx.bezierCurveTo(0.95 * s, 0.35 * s, 0.5 * s, -0.15 * s, 0, 0.35 * s);
  ctx.closePath();
}

function drawHeart(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  ctx.save();
  ctx.rotate(Math.PI); // path opens downward; flip so the point is at the bottom
  heartPath(ctx, s);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 0.08 * s;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.stroke();
  ctx.restore();
}

function drawSparkle(ctx: CanvasRenderingContext2D, s: number, a: number): void {
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = '#fff2a8';
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    const nx = ang + Math.PI / 4;
    ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
    ctx.lineTo(Math.cos(nx) * s * 0.32, Math.sin(nx) * s * 0.32);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// --- Orbiting props (birds / hearts) -------------------------------------
type Kind = 'bird' | 'heart';

function drawOrbit(ctx: CanvasRenderingContext2D, head: Head, t: number, kind: Kind, dir: number): void {
  const N = kind === 'bird' ? 5 : 5;
  const rx = head.w * 1.18;
  const ry = head.h * 0.64;
  const ocx = head.cx;
  const ocy = head.cy - head.h * 0.05; // orbit centred just above the eyes, around the head
  const spr = head.w * (kind === 'bird' ? 0.36 : 0.34);
  const omega = kind === 'bird' ? 1.7 : 1.2;

  type P = { x: number; y: number; depth: number; heading: number; scale: number; theta: number };
  const props: P[] = [];
  for (let i = 0; i < N; i++) {
    const theta = dir * (t * omega) + (i / N) * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // Local ellipse point, then rotate by head roll into screen space.
    const lx = rx * c;
    const ly = ry * s;
    const cr = Math.cos(head.roll);
    const sr = Math.sin(head.roll);
    const x = ocx + lx * cr - ly * sr;
    const y = ocy + lx * sr + ly * cr;
    // Tangent (direction of travel) for heading.
    const tx = -rx * s * dir;
    const ty = ry * c * dir;
    const heading = Math.atan2(ty * cr + tx * sr, tx * cr - ty * sr);
    const depth = s; // s<0 → upper/far arc (behind head); s>=0 → near arc (front)
    const scale = spr * (0.82 + 0.18 * s);
    props.push({ x, y, depth, heading, scale, theta });
  }

  const paint = (p: P): void => {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (kind === 'bird') {
      // Face direction of travel; keep upright-ish (no upside-down birds).
      let h = p.heading;
      if (Math.cos(h) < 0) {
        ctx.scale(1, -1);
        h = Math.atan2(-Math.sin(h), Math.cos(h));
      }
      ctx.rotate(h);
      const flap = Math.sin(t * 12 + p.theta * 2);
      ctx.globalAlpha *= 0.7 + 0.3 * (p.depth * 0.5 + 0.5);
      drawBird(ctx, p.scale, flap);
    } else {
      const pulse = 1 + 0.12 * Math.sin(t * 4 + p.theta * 3);
      ctx.rotate(0.25 * Math.sin(t * 1.5 + p.theta));
      ctx.globalAlpha *= 0.75 + 0.25 * (p.depth * 0.5 + 0.5);
      drawHeart(ctx, p.scale * pulse, p.theta % 2 < 1 ? '#e5202b' : '#ff5ea2');
    }
    ctx.restore();
  };

  // Far arc first, then the head hole, then the near arc on top → occlusion.
  const far = props.filter((p) => p.depth < 0);
  const near = props.filter((p) => p.depth >= 0);
  for (const p of far) paint(p);
  punchHead(ctx, head);
  for (const p of near) paint(p);
}

// A few hearts drifting up off the head and fading (Lovestruck extra flavour).
function drawRisingHearts(ctx: CanvasRenderingContext2D, head: Head, t: number): void {
  const N = 4;
  const period = 2.6;
  for (let i = 0; i < N; i++) {
    const phase = ((t / period) + i / N) % 1;
    const drift = head.h * (0.2 + phase * 1.4);
    const x = head.cx + Math.sin(phase * 6 + i * 2) * head.w * 0.5;
    const y = head.cy - head.h * 0.4 - drift;
    const a = phase < 0.15 ? phase / 0.15 : 1 - (phase - 0.15) / 0.85;
    const s = head.w * 0.16 * (0.7 + phase * 0.6);
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= Math.max(0, a) * 0.9;
    drawHeart(ctx, s, i % 2 ? '#ff5ea2' : '#e5202b');
    ctx.restore();
  }
}

function drawSparkles(ctx: CanvasRenderingContext2D, head: Head, t: number): void {
  const N = 4;
  for (let i = 0; i < N; i++) {
    const ang = t * 0.9 * (i % 2 ? 1 : -1) + (i / N) * Math.PI * 2;
    const rr = head.w * (0.9 + 0.15 * Math.sin(t * 2 + i));
    const x = head.cx + Math.cos(ang) * rr;
    const y = head.cy - head.h * 0.2 + Math.sin(ang) * head.h * 0.55;
    const tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.7);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t + i);
    drawSparkle(ctx, head.w * 0.09, tw);
    ctx.restore();
  }
}

// --- Face props (glasses, hats, …) --------------------------------------
// Drawn in the head's local frame: after translate(head.cx, head.cy) +
// rotate(head.roll), the origin sits at the eye midpoint with +x toward one ear
// and +y toward the chin. Everything is measured in `u` = head.w (the face
// width), so props scale and tilt with the head. They're symmetric, so the
// mirror flip (already applied in headOf) doesn't change their look.

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawShades(ctx: CanvasRenderingContext2D, u: number): void {
  const lensW = 0.36 * u;
  const lensH = 0.28 * u;
  const gap = 0.1 * u;
  const off = lensW / 2 + gap / 2;
  ctx.lineCap = 'round';
  // Temple arms toward the ears + the nose bridge.
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 0.05 * u;
  ctx.beginPath();
  ctx.moveTo(-off - lensW / 2, -0.02 * u);
  ctx.lineTo(-0.6 * u, -0.1 * u);
  ctx.moveTo(off + lensW / 2, -0.02 * u);
  ctx.lineTo(0.6 * u, -0.1 * u);
  ctx.moveTo(-gap / 2, -0.02 * u);
  ctx.lineTo(gap / 2, -0.02 * u);
  ctx.stroke();
  for (const sgn of [-1, 1]) {
    const x = sgn * off;
    roundRectPath(ctx, x - lensW / 2, -lensH / 2, lensW, lensH, 0.09 * u);
    const g = ctx.createLinearGradient(x, -lensH / 2, x, lensH / 2);
    g.addColorStop(0, '#40454d');
    g.addColorStop(0.5, '#14161b');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.035 * u;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(x - lensW * 0.18, -lensH * 0.2, lensW * 0.18, lensH * 0.12, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGlasses(ctx: CanvasRenderingContext2D, u: number): void {
  const r = 0.19 * u;
  const gap = 0.12 * u;
  const off = r + gap / 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#20242c';
  ctx.lineWidth = 0.045 * u;
  // Arms + a little curved bridge.
  ctx.beginPath();
  ctx.moveTo(-off - r, -0.02 * u);
  ctx.lineTo(-0.6 * u, -0.08 * u);
  ctx.moveTo(off + r, -0.02 * u);
  ctx.lineTo(0.6 * u, -0.08 * u);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-gap / 2, -0.02 * u);
  ctx.quadraticCurveTo(0, -0.09 * u, gap / 2, -0.02 * u);
  ctx.stroke();
  for (const sgn of [-1, 1]) {
    const x = sgn * off;
    ctx.beginPath();
    ctx.arc(x, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,225,245,0.22)';
    ctx.fill();
    ctx.strokeStyle = '#20242c';
    ctx.lineWidth = 0.05 * u;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.35, -r * 0.35, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMustache(ctx: CanvasRenderingContext2D, u: number): void {
  ctx.fillStyle = '#2b1d12';
  for (const sgn of [-1, 1]) {
    ctx.save();
    ctx.scale(sgn, 1);
    ctx.beginPath();
    ctx.moveTo(0, 0.03 * u); // centre dip under the nose
    ctx.bezierCurveTo(0.12 * u, -0.14 * u, 0.34 * u, -0.16 * u, 0.44 * u, -0.14 * u); // sweep up to the curl
    ctx.bezierCurveTo(0.53 * u, -0.13 * u, 0.52 * u, 0.0 * u, 0.42 * u, 0.02 * u); // curled tip
    ctx.bezierCurveTo(0.32 * u, 0.03 * u, 0.18 * u, 0.08 * u, 0.09 * u, 0.16 * u); // underside
    ctx.bezierCurveTo(0.05 * u, 0.19 * u, 0.02 * u, 0.13 * u, 0, 0.09 * u); // back to centre
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawClownNose(ctx: CanvasRenderingContext2D, u: number): void {
  const r = 0.15 * u;
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ff6a5a');
  g.addColorStop(0.6, '#e5202b');
  g.addColorStop(1, '#b3121a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.35, r * 0.22, r * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawTopHat(ctx: CanvasRenderingContext2D, u: number): void {
  const brimW = 1.18 * u;
  const brimH = 0.17 * u;
  const crownW = 0.66 * u;
  const crownH = 0.72 * u;
  ctx.fillStyle = '#17171c';
  roundRectPath(ctx, -crownW / 2, -crownH, crownW, crownH + 0.04 * u, 0.05 * u);
  ctx.fill();
  ctx.fillStyle = '#e5202b'; // hat band
  ctx.fillRect(-crownW / 2, -0.17 * u, crownW, 0.13 * u);
  ctx.fillStyle = '#17171c'; // brim on top of the crown base
  ctx.beginPath();
  ctx.ellipse(0, 0, brimW / 2, brimH / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; // sheen
  roundRectPath(ctx, -crownW / 2 + 0.05 * u, -crownH + 0.05 * u, 0.09 * u, crownH - 0.24 * u, 0.03 * u);
  ctx.fill();
}

function drawCrown(ctx: CanvasRenderingContext2D, u: number): void {
  const w = 1.02 * u;
  const h = 0.5 * u;
  const pts = 5;
  const valley = -0.35 * h;
  ctx.strokeStyle = '#d99a1f';
  ctx.lineWidth = 0.03 * u;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(-w / 2, valley);
  for (let i = 0; i < pts; i++) {
    const xMid = -w / 2 + ((i + 0.5) / pts) * w;
    const xEnd = -w / 2 + ((i + 1) / pts) * w;
    ctx.lineTo(xMid, -h); // peak
    ctx.lineTo(xEnd, valley); // valley
  }
  ctx.lineTo(w / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const jewels = ['#e5202b', '#2b7fd4', '#8fd92e', '#ff5ea2', '#12cfda'];
  for (let i = 0; i < pts; i++) {
    const xMid = -w / 2 + ((i + 0.5) / pts) * w;
    ctx.fillStyle = jewels[i % jewels.length];
    ctx.beginPath();
    ctx.arc(xMid, -h + 0.08 * u, 0.045 * u, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPuppy(ctx: CanvasRenderingContext2D, u: number): void {
  // Floppy ears above the head…
  for (const sgn of [-1, 1]) {
    ctx.save();
    ctx.translate(sgn * 0.52 * u, -0.42 * u);
    ctx.rotate(sgn * 0.5);
    ctx.fillStyle = '#6b4423';
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.22 * u, 0.42 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c98a9a';
    ctx.beginPath();
    ctx.ellipse(0, 0.06 * u, 0.11 * u, 0.28 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // …and a shiny black nose on the face.
  ctx.save();
  ctx.translate(0, 0.5 * u);
  ctx.fillStyle = '#241a17';
  ctx.beginPath();
  ctx.moveTo(0, 0.12 * u);
  ctx.bezierCurveTo(-0.18 * u, 0.02 * u, -0.14 * u, -0.12 * u, 0, -0.08 * u);
  ctx.bezierCurveTo(0.14 * u, -0.12 * u, 0.18 * u, 0.02 * u, 0, 0.12 * u);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(-0.05 * u, -0.04 * u, 0.04 * u, 0.03 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFaceProp(ctx: CanvasRenderingContext2D, id: FacePropId, head: Head): void {
  const u = head.w; // the face width is the scale unit for every prop
  ctx.save();
  ctx.translate(head.cx, head.cy); // origin = eye midpoint
  ctx.rotate(head.roll);
  ctx.lineJoin = 'round';
  switch (id) {
    case 'shades':
      drawShades(ctx, u);
      break;
    case 'glasses':
      drawGlasses(ctx, u);
      break;
    case 'mustache':
      ctx.translate(0, 0.52 * u); // between nose and mouth
      drawMustache(ctx, u);
      break;
    case 'clownnose':
      ctx.translate(0, 0.44 * u); // on the nose tip
      drawClownNose(ctx, u);
      break;
    case 'tophat':
      ctx.translate(0, -0.66 * u); // above the head
      drawTopHat(ctx, u);
      break;
    case 'crown':
      ctx.translate(0, -0.62 * u);
      drawCrown(ctx, u);
      break;
    case 'puppy':
      drawPuppy(ctx, u);
      break;
    default:
      break;
  }
  ctx.restore();
}

/**
 * Draw the AR layer (an orbit overlay and/or a face prop) onto a TRANSPARENT
 * layer context — it clears the region first. `anchor` is the raw head anchor
 * from face.ts; `mirror` matches the preview/capture; `tMs` is a monotonic clock
 * driving the orbit animation. No-op for all-'none' or a null/faded anchor — the
 * caller then just shows the plain frame. The orbit draws first (with its behind-
 * the-head occlusion); the prop draws on top, in front of the face.
 */
export function drawAR(
  ctx: CanvasRenderingContext2D,
  overlayId: OverlayId,
  propId: FacePropId,
  anchor: FaceAnchor | null,
  tMs: number,
  mirror: boolean,
  W: number,
  H: number,
): void {
  ctx.clearRect(0, 0, W, H);
  if (!anchor) return;
  if (overlayId === 'none' && propId === 'none') return;
  const head = headOf(anchor, mirror, W, H);
  const t = tMs / 1000;
  ctx.save();
  ctx.globalAlpha = anchor.alpha;
  if (overlayId === 'dizzy') {
    drawOrbit(ctx, head, t, 'bird', 1);
    drawSparkles(ctx, head, t);
  } else if (overlayId === 'lovestruck') {
    drawOrbit(ctx, head, t, 'heart', 1);
    drawRisingHearts(ctx, head, t);
  }
  if (propId !== 'none') drawFaceProp(ctx, propId, head);
  ctx.restore();
}
