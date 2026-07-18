// AR painters (lazy chunk). Everything that actually DRAWS the AR layer lives
// here — orbit overlays (Dizzy Birds, Lovestruck), face props (glasses, hats),
// and face paint (butterfly, tiger, …). overlay.ts dynamically import()s this on
// the first AR activation (ensureOverlayDraw), so none of this canvas code sits
// in the base bundle — it downloads only when a face effect is chosen.
//
// It's an ADDITIVE top layer, not a render path: it draws onto a transparent
// canvas over whatever's underneath (plain feed, GPU effect, or green-screen
// composite), so it never calls renderLive() and can't break the one-consumer-
// per-frame rule. The same draw runs for the live preview, baked photos, and
// recorded clips. Everything is procedural (no image assets → self-contained,
// offline, crisp at any resolution) and placed from the anchor-only head box
// (centre, size, tilt) — no landmark mesh. Far-side orbiters are occluded by a
// soft head-shaped hole (destination-out) so they pass BEHIND the head; face
// paint draws AFTER that punch (so it isn't erased) and props draw on top.

import type { OverlayId, FacePropId, FacePaintId } from './overlay';
import type { FaceAnchor } from './face';

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

// --- Face paint (butterfly, tiger, …) -----------------------------------
// The third AR family: designs PAINTED on the skin, drawn in the same head-local
// frame as the props (origin = eye midpoint after translate+rotate, +x toward an
// ear, +y toward the chin, unit u = face width). Symmetric, so the mirror flip is
// a no-op on the look. Washes are semi-transparent so the face reads through;
// line work (whiskers, horn) is opaque. Reference points: each eye ≈ ±0.23u at
// y≈0, nose ≈ 0.44u, mouth ≈ 0.52u, cheeks ≈ (±0.32u, 0.28u), forehead ≈ -0.4u.

function starPath(ctx: CanvasRenderingContext2D, r: number, inner = 0.42): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const ang = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const x = Math.cos(ang) * rad;
    const y = Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, stroke?: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  starPath(ctx, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = r * 0.14;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
  ctx.restore();
}

function paintButterfly(ctx: CanvasRenderingContext2D, u: number): void {
  ctx.globalAlpha *= 0.85;
  for (const sgn of [-1, 1]) {
    ctx.save();
    ctx.scale(sgn, 1);
    const gU = ctx.createLinearGradient(0.1 * u, -0.25 * u, 0.5 * u, 0.05 * u);
    gU.addColorStop(0, '#b06cff');
    gU.addColorStop(1, '#7a2ecc');
    ctx.fillStyle = gU;
    ctx.beginPath();
    ctx.moveTo(0.08 * u, -0.02 * u);
    ctx.bezierCurveTo(0.12 * u, -0.34 * u, 0.5 * u, -0.34 * u, 0.52 * u, -0.06 * u);
    ctx.bezierCurveTo(0.5 * u, 0.06 * u, 0.28 * u, 0.08 * u, 0.08 * u, -0.02 * u);
    ctx.closePath();
    ctx.fill();
    const gL = ctx.createLinearGradient(0.1 * u, 0.05 * u, 0.42 * u, 0.4 * u);
    gL.addColorStop(0, '#ff8fd0');
    gL.addColorStop(1, '#e5439a');
    ctx.fillStyle = gL;
    ctx.beginPath();
    ctx.moveTo(0.09 * u, 0.02 * u);
    ctx.bezierCurveTo(0.3 * u, 0.1 * u, 0.46 * u, 0.22 * u, 0.34 * u, 0.42 * u);
    ctx.bezierCurveTo(0.2 * u, 0.5 * u, 0.08 * u, 0.28 * u, 0.09 * u, 0.02 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(0.3 * u, -0.13 * u, 0.04 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,140,0.9)';
    ctx.beginPath();
    ctx.arc(0.24 * u, 0.24 * u, 0.03 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#3a2352';
  ctx.beginPath();
  ctx.ellipse(0, 0.16 * u, 0.035 * u, 0.26 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a2352';
  ctx.lineWidth = 0.02 * u;
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -0.06 * u);
    ctx.quadraticCurveTo(sgn * 0.08 * u, -0.28 * u, sgn * 0.12 * u, -0.36 * u);
    ctx.stroke();
    ctx.fillStyle = '#3a2352';
    ctx.beginPath();
    ctx.arc(sgn * 0.12 * u, -0.37 * u, 0.02 * u, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintTiger(ctx: CanvasRenderingContext2D, u: number): void {
  ctx.save();
  ctx.globalAlpha *= 0.42;
  ctx.fillStyle = '#f28a1e';
  ctx.beginPath();
  ctx.ellipse(0, -0.02 * u, 0.62 * u, 0.5 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha *= 0.85;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(0, 0.5 * u, 0.3 * u, 0.24 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#161311';
  const stripe = (x: number, y: number, ang: number, len: number, w: number): void => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(w, len * 0.5, 0, len);
    ctx.quadraticCurveTo(-w, len * 0.5, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  stripe(0, -0.44 * u, 0, 0.24 * u, 0.03 * u);
  stripe(-0.13 * u, -0.42 * u, -0.22, 0.2 * u, 0.028 * u);
  stripe(0.13 * u, -0.42 * u, 0.22, 0.2 * u, 0.028 * u);
  for (const sgn of [-1, 1]) {
    stripe(sgn * 0.3 * u, 0.16 * u, sgn * 1.3, 0.24 * u, 0.03 * u);
    stripe(sgn * 0.39 * u, 0.3 * u, sgn * 1.3, 0.2 * u, 0.026 * u);
  }
  ctx.fillStyle = '#161311';
  ctx.save();
  ctx.translate(0, 0.42 * u);
  ctx.beginPath();
  ctx.moveTo(0, 0.06 * u);
  ctx.bezierCurveTo(-0.09 * u, 0, -0.08 * u, -0.07 * u, 0, -0.05 * u);
  ctx.bezierCurveTo(0.08 * u, -0.07 * u, 0.09 * u, 0, 0, 0.06 * u);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#161311';
  ctx.lineWidth = 0.012 * u;
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(sgn * 0.1 * u, 0.5 * u + (i - 1) * 0.05 * u);
      ctx.lineTo(sgn * 0.44 * u, 0.44 * u + (i - 1) * 0.09 * u);
      ctx.stroke();
    }
  }
}

function paintKitty(ctx: CanvasRenderingContext2D, u: number): void {
  for (const sgn of [-1, 1]) {
    ctx.save();
    ctx.translate(sgn * 0.34 * u, -0.6 * u);
    ctx.fillStyle = '#4a4a52';
    ctx.beginPath();
    ctx.moveTo(-0.14 * u, 0.16 * u);
    ctx.lineTo(0, -0.2 * u);
    ctx.lineTo(0.14 * u, 0.16 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff9ec4';
    ctx.beginPath();
    ctx.moveTo(-0.07 * u, 0.1 * u);
    ctx.lineTo(0, -0.08 * u);
    ctx.lineTo(0.07 * u, 0.1 * u);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(0, 0.44 * u);
  ctx.fillStyle = '#ff6aa8';
  ctx.beginPath();
  ctx.moveTo(0, 0.07 * u);
  ctx.bezierCurveTo(-0.1 * u, -0.02 * u, -0.06 * u, -0.1 * u, 0, -0.04 * u);
  ctx.bezierCurveTo(0.06 * u, -0.1 * u, 0.1 * u, -0.02 * u, 0, 0.07 * u);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#3a3a40';
  ctx.lineWidth = 0.014 * u;
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(sgn * 0.12 * u, 0.5 * u + (i - 1) * 0.04 * u);
      ctx.quadraticCurveTo(sgn * 0.3 * u, 0.46 * u + (i - 1) * 0.08 * u, sgn * 0.46 * u, 0.42 * u + (i - 1) * 0.12 * u);
      ctx.stroke();
    }
  }
  ctx.save();
  ctx.globalAlpha *= 0.4;
  ctx.fillStyle = '#ff9ec4';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sgn * 0.34 * u, 0.34 * u, 0.1 * u, 0.07 * u, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintUnicorn(ctx: CanvasRenderingContext2D, u: number): void {
  // Golden spiral horn on the upper forehead.
  ctx.save();
  ctx.translate(0, -0.4 * u);
  const gh = ctx.createLinearGradient(-0.1 * u, 0, 0.1 * u, 0);
  gh.addColorStop(0, '#e0a521');
  gh.addColorStop(0.5, '#ffe9a0');
  gh.addColorStop(1, '#e0a521');
  ctx.fillStyle = gh;
  ctx.beginPath();
  ctx.moveTo(-0.1 * u, 0);
  ctx.lineTo(0, -0.46 * u);
  ctx.lineTo(0.1 * u, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(170,110,10,0.85)';
  ctx.lineWidth = 0.02 * u;
  for (let i = 1; i <= 5; i++) {
    const y = -i * 0.075 * u;
    const wgt = 0.1 * u * (1 - i / 6);
    ctx.beginPath();
    ctx.moveTo(-wgt, y + 0.025 * u);
    ctx.lineTo(wgt, y - 0.025 * u);
    ctx.stroke();
  }
  ctx.restore();
  // A neat rainbow fringe on the forehead, just below the horn.
  ctx.save();
  ctx.globalAlpha *= 0.9;
  const cols = ['#e5202b', '#ff8a1e', '#ffd21e', '#5bc94a', '#2b7fd4', '#8a4fd0'];
  ctx.lineWidth = 0.028 * u;
  cols.forEach((c, i) => {
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.arc(0, -0.02 * u, (0.28 - i * 0.028) * u, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  });
  ctx.restore();
  // Rosy cheeks + a couple of cheek stars.
  ctx.save();
  ctx.globalAlpha *= 0.4;
  ctx.fillStyle = '#ff9ec4';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sgn * 0.32 * u, 0.34 * u, 0.1 * u, 0.07 * u, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  drawStar(ctx, -0.36 * u, 0.2 * u, 0.055 * u, '#ffd24a', 'rgba(180,120,10,0.7)');
  drawStar(ctx, 0.37 * u, 0.26 * u, 0.045 * u, '#8a4fd0');
}

function paintSuperhero(ctx: CanvasRenderingContext2D, u: number): void {
  const g = ctx.createLinearGradient(0, -0.2 * u, 0, 0.12 * u);
  g.addColorStop(0, '#2f6bd8');
  g.addColorStop(1, '#1743a8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-0.46 * u, -0.02 * u);
  ctx.bezierCurveTo(-0.5 * u, -0.2 * u, -0.28 * u, -0.24 * u, -0.14 * u, -0.16 * u);
  ctx.bezierCurveTo(-0.05 * u, -0.1 * u, 0.05 * u, -0.1 * u, 0.14 * u, -0.16 * u);
  ctx.bezierCurveTo(0.28 * u, -0.24 * u, 0.5 * u, -0.2 * u, 0.46 * u, -0.02 * u);
  ctx.bezierCurveTo(0.44 * u, 0.14 * u, 0.28 * u, 0.2 * u, 0.16 * u, 0.12 * u);
  ctx.bezierCurveTo(0.06 * u, 0.06 * u, -0.06 * u, 0.06 * u, -0.16 * u, 0.12 * u);
  ctx.bezierCurveTo(-0.28 * u, 0.2 * u, -0.44 * u, 0.14 * u, -0.46 * u, -0.02 * u);
  ctx.closePath();
  for (const sgn of [-1, 1]) {
    ctx.moveTo(sgn * 0.23 * u + 0.11 * u, 0);
    ctx.ellipse(sgn * 0.23 * u, 0, 0.11 * u, 0.08 * u, 0, 0, Math.PI * 2);
  }
  ctx.fill('evenodd');
  drawStar(ctx, 0, -0.32 * u, 0.07 * u, '#ffd21e', '#c98f0a');
}

function paintRainbow(ctx: CanvasRenderingContext2D, u: number): void {
  ctx.save();
  ctx.globalAlpha *= 0.9;
  const cols = ['#e5202b', '#ff8a1e', '#ffd21e', '#5bc94a', '#2b7fd4', '#8a4fd0'];
  const cy = 0.12 * u;
  ctx.lineWidth = 0.05 * u;
  cols.forEach((c, i) => {
    const r = 0.5 * u - i * 0.05 * u;
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.arc(0, cy, r, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  });
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const sgn of [-1, 1]) {
    const x = sgn * 0.42 * u;
    const y = -0.06 * u;
    ctx.beginPath();
    ctx.arc(x, y, 0.07 * u, 0, Math.PI * 2);
    ctx.arc(x + sgn * 0.06 * u, y + 0.02 * u, 0.05 * u, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintStars(ctx: CanvasRenderingContext2D, u: number): void {
  drawStar(ctx, -0.32 * u, 0.26 * u, 0.13 * u, '#ffd21e', '#e0a521');
  drawStar(ctx, 0.32 * u, 0.26 * u, 0.13 * u, '#2b7fd4', '#1743a8');
  const sprinkle: [number, number, number, string][] = [
    [-0.42, -0.1, 0.05, '#ff5ea2'],
    [0.44, -0.06, 0.045, '#5bc94a'],
    [-0.2, -0.34, 0.04, '#8a4fd0'],
    [0.18, -0.36, 0.05, '#ff8a1e'],
    [0.05, -0.2, 0.03, '#12cfda'],
  ];
  for (const [x, y, r, c] of sprinkle) drawStar(ctx, x * u, y * u, r * u, c);
}

function drawFacePaint(ctx: CanvasRenderingContext2D, id: FacePaintId, head: Head): void {
  const u = head.w; // face width = the scale unit, matching the props
  ctx.save();
  ctx.translate(head.cx, head.cy); // origin = eye midpoint
  ctx.rotate(head.roll);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (id) {
    case 'butterfly':
      paintButterfly(ctx, u);
      break;
    case 'unicorn':
      paintUnicorn(ctx, u);
      break;
    case 'tiger':
      paintTiger(ctx, u);
      break;
    case 'kitty':
      paintKitty(ctx, u);
      break;
    case 'superhero':
      paintSuperhero(ctx, u);
      break;
    case 'rainbow':
      paintRainbow(ctx, u);
      break;
    case 'stars':
      paintStars(ctx, u);
      break;
    default:
      break;
  }
  ctx.restore();
}

/**
 * Draw the AR layer (an orbit overlay, face paint, and/or a face prop) onto a
 * TRANSPARENT layer context — it clears the region first. `anchor` is the raw
 * head anchor from face.ts; `mirror` matches the preview/capture; `tMs` is a
 * monotonic clock driving the orbit animation. No-op for all-'none' or a
 * null/faded anchor. Layer order (bottom→top): the orbit (with its behind-the-
 * head occlusion), then face paint on the skin (after the punch so it isn't
 * erased), then props in front of the face.
 */
export function drawAR(
  ctx: CanvasRenderingContext2D,
  overlayId: OverlayId,
  propId: FacePropId,
  facePaintId: FacePaintId,
  anchor: FaceAnchor | null,
  tMs: number,
  mirror: boolean,
  W: number,
  H: number,
): void {
  ctx.clearRect(0, 0, W, H);
  if (!anchor) return;
  if (overlayId === 'none' && propId === 'none' && facePaintId === 'none') return;
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
  if (facePaintId !== 'none') drawFacePaint(ctx, facePaintId, head);
  if (propId !== 'none') drawFaceProp(ctx, propId, head);
  ctx.restore();
}
