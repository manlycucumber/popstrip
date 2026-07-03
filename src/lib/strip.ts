// Composing captured frames into a print-ready photo. One config per layout; a
// frame is center-cropped ("cover") into each cell, then a PopStrip footer with
// the date is drawn underneath. Canvases are sized at ~300 DPI so the result is
// print-ready by construction and just downscaled for the web.

import type { Layout, Shot } from './capture';

type Spec = {
  w: number;
  h: number;
  cols: number;
  rows: number;
  margin: number;
  gap: number;
  footer: number;
  radius: number;
  brand: number;
};

// Print sizes at 300 DPI, with every photo cell at a 4:3 aspect (matching the
// camera + preview → true WYSIWYG): single ≈ 5"×4.2", quad ≈ 4"×3.5",
// strip ≈ 2"×6.3". Cell aspects: single 1440×1080, quad 561×421, strip 552×414.
const SPECS: Record<Layout, Spec> = {
  single: { w: 1500, h: 1270, cols: 1, rows: 1, margin: 30, gap: 0, footer: 130, radius: 16, brand: 50 },
  quad: { w: 1200, h: 1060, cols: 2, rows: 2, margin: 30, gap: 18, footer: 140, radius: 16, brand: 48 },
  strip: { w: 600, h: 1902, cols: 1, rows: 4, margin: 24, gap: 16, footer: 150, radius: 12, brand: 40 },
};

const INK = '#1a1626';
const ACCENT = '#ff2e88';
const DOTS = ['#ff2e88', '#ffcc00', '#00c2d6'];

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

/** Draw `img` to fill the box, center-cropping any overflow (CSS object-fit: cover). */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const iw = img.width;
  const ih = img.height;
  if (!iw || !ih) return;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

export async function compose(
  frames: HTMLCanvasElement[],
  layout: Layout,
  opts: { date?: string } = {},
): Promise<Shot> {
  const spec = SPECS[layout];
  const canvas = document.createElement('canvas');
  canvas.width = spec.w;
  canvas.height = spec.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create a drawing canvas.');

  // White paper.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, spec.w, spec.h);

  const cellW = (spec.w - 2 * spec.margin - (spec.cols - 1) * spec.gap) / spec.cols;
  const cellH = (spec.h - 2 * spec.margin - (spec.rows - 1) * spec.gap - spec.footer) / spec.rows;
  const cells = spec.cols * spec.rows;

  for (let i = 0; i < cells; i++) {
    const frame = frames[Math.min(i, frames.length - 1)];
    const col = i % spec.cols;
    const row = Math.floor(i / spec.cols);
    const x = spec.margin + col * (cellW + spec.gap);
    const y = spec.margin + row * (cellH + spec.gap);

    ctx.save();
    roundRectPath(ctx, x, y, cellW, cellH, spec.radius);
    ctx.clip();
    if (frame) {
      drawCover(ctx, frame, x, y, cellW, cellH);
    } else {
      ctx.fillStyle = '#eee';
      ctx.fillRect(x, y, cellW, cellH);
    }
    ctx.restore();

    // Hairline edge around each cell.
    ctx.save();
    roundRectPath(ctx, x + 1, y + 1, cellW - 2, cellH - 2, spec.radius);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.10)';
    ctx.stroke();
    ctx.restore();
  }

  // Footer: three pop dots, the wordmark, and the date.
  const cx = spec.w / 2;
  const footTop = spec.h - spec.footer;
  const dotR = layout === 'strip' ? 7 : 9;
  DOTS.forEach((color, idx) => {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(cx + (idx - 1) * dotR * 3, footTop + spec.footer * 0.26, dotR, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ACCENT;
  ctx.font = `700 ${spec.brand}px Verdana, Geneva, Tahoma, sans-serif`;
  ctx.fillText('PopStrip', cx, footTop + spec.footer * 0.56);

  const date = opts.date ?? new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  ctx.fillStyle = INK;
  ctx.font = `700 ${Math.round(spec.brand * 0.48)}px 'Courier New', 'Lucida Console', monospace`;
  ctx.fillText(date, cx, footTop + spec.footer * 0.83);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render the photo.'))), 'image/png');
  });

  return { blob, url: URL.createObjectURL(blob), width: spec.w, height: spec.h, kind: layout, createdAt: Date.now() };
}
