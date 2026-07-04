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

/**
 * Draw the overlay for `id` onto a TRANSPARENT layer context (it clears the
 * region first). `anchor` is the raw head anchor from face.ts; `mirror` matches
 * the preview/capture; `tMs` is a monotonic clock (drives the animation). No-op
 * for 'none' or a null/faded anchor — the caller then just shows the plain frame.
 */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  id: OverlayId,
  anchor: FaceAnchor | null,
  tMs: number,
  mirror: boolean,
  W: number,
  H: number,
): void {
  ctx.clearRect(0, 0, W, H);
  if (id === 'none' || !anchor) return;
  const head = headOf(anchor, mirror, W, H);
  const t = tMs / 1000;
  ctx.save();
  ctx.globalAlpha = anchor.alpha;
  if (id === 'dizzy') {
    drawOrbit(ctx, head, t, 'bird', 1);
    drawSparkles(ctx, head, t);
  } else {
    drawOrbit(ctx, head, t, 'heart', 1);
    drawRisingHearts(ctx, head, t);
  }
  ctx.restore();
}
