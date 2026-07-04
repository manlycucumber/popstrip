// Decorative photo frames — the border you put AROUND your picture.
//
// Like the AR overlays, a frame is an ADDITIVE top layer: drawFrame() paints an
// opaque decorative band into the outer edge of a canvas and leaves the middle
// untouched, so it composes over ANY base (the live feed, a captured still, a
// recorded movie frame) and never calls renderLive() — it can't break the
// one-consumer-per-frame rule. Unlike the AR/green-screen layers it needs no
// model, no tracking and no animation: it's a single static draw.
//
// Everything is procedural (no image assets → self-contained, offline, crisp at
// any resolution). Frames are symmetric, so the mirror flip is a no-op for them.

export type FrameId =
  | 'none'
  | 'classic'
  | 'film'
  | 'comic'
  | 'hearts'
  | 'stars'
  | 'confetti'
  | 'tape';

export type Frame = { id: FrameId; label: string };

/** The chooser roster: None, then the frames. */
export const FRAMES: Frame[] = [
  { id: 'none', label: 'None' },
  { id: 'classic', label: 'Classic' },
  { id: 'film', label: 'Filmstrip' },
  { id: 'comic', label: 'Comic' },
  { id: 'hearts', label: 'Hearts' },
  { id: 'stars', label: 'Stars' },
  { id: 'confetti', label: 'Confetti' },
  { id: 'tape', label: 'Tape' },
];

const FRAME_IDS = FRAMES.map((f) => f.id) as string[];

export function isFrameId(v: unknown): v is FrameId {
  return typeof v === 'string' && FRAME_IDS.includes(v);
}

// --- Primitives ----------------------------------------------------------

/** Fill a border band `t` thick whose OUTER edge is inset by `off`, leaving the
 * centre transparent (the picture shows through the hole). */
function fillBand(ctx: CanvasRenderingContext2D, W: number, H: number, off: number, t: number, color: string): void {
  ctx.fillStyle = color;
  const iw = W - 2 * off;
  const ih = H - 2 * off;
  ctx.fillRect(off, off, iw, t); // top
  ctx.fillRect(off, H - off - t, iw, t); // bottom
  ctx.fillRect(off, off + t, t, ih - 2 * t); // left
  ctx.fillRect(W - off - t, off + t, t, ih - 2 * t); // right
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Evenly-spaced points along the centre-line of the border band (an inset
 * rectangle perimeter), including the corners once, no duplicates. */
function edgeSlots(W: number, H: number, b: number, spacing: number): Array<{ x: number; y: number }> {
  const c = b / 2; // band centre-line inset
  const pts: Array<{ x: number; y: number }> = [];
  const line = (x0: number, y0: number, x1: number, y1: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / spacing));
    for (let i = 0; i < n; i++) {
      const t = i / n; // [0,1) — excludes the endpoint (the next line's start)
      pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
    }
  };
  line(c, c, W - c, c); // top
  line(W - c, c, W - c, H - c); // right
  line(W - c, H - c, c, H - c); // bottom
  line(c, H - c, c, c); // left
  return pts;
}

function heartAt(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.28);
  ctx.bezierCurveTo(s * 0.55, -s * 0.95, s * 1.05, -s * 0.05, 0, s * 0.7);
  ctx.bezierCurveTo(-s * 1.05, -s * 0.05, -s * 0.55, -s * 0.95, 0, -s * 0.28);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.12);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.stroke();
}

function starAt(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.42 : r;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = '#d99a1f';
  ctx.stroke();
}

// --- Frames --------------------------------------------------------------

function classic(ctx: CanvasRenderingContext2D, W: number, H: number, m: number): void {
  const b = Math.round(m * 0.055);
  fillBand(ctx, W, H, 0, b, '#e5202b'); // bold red band
  const lw = Math.max(2, b * 0.14);
  ctx.strokeStyle = '#141414'; // hard ink keyline just inside the red
  ctx.lineWidth = lw;
  ctx.strokeRect(b - lw / 2, b - lw / 2, W - 2 * b + lw, H - 2 * b + lw);
  const ol = Math.max(2, b * 0.1);
  ctx.strokeStyle = '#f3f0e6'; // thin cream keyline at the very outer edge (that hard 90s double-edge)
  ctx.lineWidth = ol;
  ctx.strokeRect(ol / 2, ol / 2, W - ol, H - ol);
}

function film(ctx: CanvasRenderingContext2D, W: number, H: number, m: number): void {
  const b = Math.round(m * 0.08);
  fillBand(ctx, W, H, 0, b, '#111');
  const holeH = b * 0.42;
  const holeW = holeH * 1.3;
  const inset = b * 0.25;
  const usable = W - 2 * inset;
  const n = Math.max(3, Math.round(usable / (holeW * 1.9)));
  const step = usable / n;
  ctx.fillStyle = '#f3f0e6';
  for (let i = 0; i < n; i++) {
    const cx = inset + step * (i + 0.5);
    roundRectPath(ctx, cx - holeW / 2, (b - holeH) / 2, holeW, holeH, holeH * 0.28);
    ctx.fill();
    roundRectPath(ctx, cx - holeW / 2, H - b + (b - holeH) / 2, holeW, holeH, holeH * 0.28);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; // thin sheen keyline where film meets image
  ctx.lineWidth = Math.max(1, b * 0.06);
  ctx.strokeRect(b, b, W - 2 * b, H - 2 * b);
}

function comic(ctx: CanvasRenderingContext2D, W: number, H: number, m: number): void {
  const b = Math.round(m * 0.06);
  fillBand(ctx, W, H, 0, b, '#141414'); // bold black outer
  fillBand(ctx, W, H, b, Math.round(b * 0.5), '#ffd21e'); // yellow inner panel line, over the image edge
  const ol = Math.max(2, b * 0.1);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = ol;
  ctx.strokeRect(ol / 2, ol / 2, W - ol, H - ol);
}

function hearts(ctx: CanvasRenderingContext2D, W: number, H: number, m: number): void {
  const b = Math.round(m * 0.065);
  fillBand(ctx, W, H, 0, b, '#ffd9e8'); // soft pink band
  ctx.strokeStyle = '#ff5ea2';
  ctx.lineWidth = Math.max(2, b * 0.1);
  ctx.strokeRect(b, b, W - 2 * b, H - 2 * b);
  const s = b * 0.5;
  edgeSlots(W, H, b, s * 2.4).forEach((p, i) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    heartAt(ctx, s, i % 2 ? '#e5202b' : '#ff5ea2');
    ctx.restore();
  });
}

function stars(ctx: CanvasRenderingContext2D, W: number, H: number, m: number): void {
  const b = Math.round(m * 0.065);
  fillBand(ctx, W, H, 0, b, '#2b34d6'); // bold blue band
  ctx.strokeStyle = '#12cfda';
  ctx.lineWidth = Math.max(2, b * 0.1);
  ctx.strokeRect(b, b, W - 2 * b, H - 2 * b);
  const s = b * 0.5;
  edgeSlots(W, H, b, s * 2.6).forEach((p, i) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    starAt(ctx, s, i % 3 ? '#ffd23f' : '#fff');
    ctx.restore();
  });
}

function confetti(ctx: CanvasRenderingContext2D, W: number, H: number, m: number): void {
  const b = Math.round(m * 0.06);
  fillBand(ctx, W, H, 0, b, '#f3f0e6'); // cream band
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = Math.max(2, b * 0.09);
  ctx.strokeRect(b, b, W - 2 * b, H - 2 * b); // inner hard keyline
  const palette = ['#e5202b', '#ffd21e', '#12cfda', '#2b34d6', '#8fd92e', '#ff5ea2'];
  const s = b * 0.34;
  edgeSlots(W, H, b, s * 2.1).forEach((p, i) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    const j = Math.sin(i * 12.9898) * 43758.5453; // deterministic per-slot jitter
    ctx.rotate((j - Math.floor(j)) * Math.PI);
    ctx.fillStyle = palette[i % palette.length];
    const shape = i % 3;
    if (shape === 0) {
      ctx.fillRect(-s * 0.6, -s * 0.35, s * 1.2, s * 0.7);
    } else if (shape === 1) {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.8, s * 0.7);
      ctx.lineTo(-s * 0.8, s * 0.7);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.66, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function tape(ctx: CanvasRenderingContext2D, W: number, H: number, m: number): void {
  // Four translucent washi-tape strips crossing the corners; the middle (and
  // most of the edges) stay clear — a light scrapbook look, not a full band.
  const len = m * 0.28;
  const th = m * 0.075;
  const colors = ['rgba(255,94,162,0.7)', 'rgba(18,207,218,0.7)', 'rgba(255,210,30,0.72)', 'rgba(143,217,46,0.7)'];
  const near = len * 0.12;
  const corners = [
    { x: near, y: near, rot: Math.PI / 4 },
    { x: W - near, y: near, rot: -Math.PI / 4 },
    { x: W - near, y: H - near, rot: Math.PI / 4 },
    { x: near, y: H - near, rot: -Math.PI / 4 },
  ];
  corners.forEach((c, i) => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-len / 2, -th / 2, len, th);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; // soft tape edges
    ctx.lineWidth = Math.max(1, th * 0.08);
    ctx.beginPath();
    ctx.moveTo(-len / 2, -th / 2);
    ctx.lineTo(len / 2, -th / 2);
    ctx.moveTo(-len / 2, th / 2);
    ctx.lineTo(len / 2, th / 2);
    ctx.stroke();
    ctx.restore();
  });
}

/**
 * Draw the frame `id` into the rectangle [0,0,W,H] of `ctx`, decorating the outer
 * edge and leaving the centre untouched. Assumes an identity transform (all call
 * sites — the live preview canvas, the movie canvas, the photo composite — draw
 * at identity). No-op for 'none' or a degenerate size.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, id: FrameId, W: number, H: number): void {
  if (id === 'none' || W < 8 || H < 8) return;
  const m = Math.min(W, H);
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineJoin = 'round';
  switch (id) {
    case 'classic':
      classic(ctx, W, H, m);
      break;
    case 'film':
      film(ctx, W, H, m);
      break;
    case 'comic':
      comic(ctx, W, H, m);
      break;
    case 'hearts':
      hearts(ctx, W, H, m);
      break;
    case 'stars':
      stars(ctx, W, H, m);
      break;
    case 'confetti':
      confetti(ctx, W, H, m);
      break;
    case 'tape':
      tape(ctx, W, H, m);
      break;
    default:
      break;
  }
  ctx.restore();
}
