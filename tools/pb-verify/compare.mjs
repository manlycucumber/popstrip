// Compare PopStrip renders (out/ours-<id>.png) against Photo Booth references
// (refs/<id>.png) per effect, writing scores.json. Metrics:
//   • ssim    — structural similarity on luma (color/stylize fidelity)
//   • mae     — mean abs per-channel error 0..255 (color drift)
//   • edgeIoU — IoU of Sobel edge masks (warp displacement match)
// Thresholds in thresholds.json decide pass/fail. These are coarse, whole-image
// metrics — good enough to catch regressions and rank worst-first; refine
// (windowed SSIM, patch-only ΔE, alignment via the green corner marks) once real
// references exist.
//
// Prereq: `npm i -D pngjs`. Usage: node tools/pb-verify/compare.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

const dir = dirname(fileURLToPath(import.meta.url));
const REFS = join(dir, 'refs');
const OUT = join(dir, 'out');
const thresholds = JSON.parse(readFileSync(join(dir, 'thresholds.json'), 'utf8'));

const RW = 512, RH = 384; // common 4:3 compare size

function loadResized(path) {
  const png = PNG.sync.read(readFileSync(path));
  const out = new Uint8ClampedArray(RW * RH * 4);
  for (let y = 0; y < RH; y++) {
    const sy = Math.floor((y / RH) * png.height);
    for (let x = 0; x < RW; x++) {
      const sx = Math.floor((x / RW) * png.width);
      const si = (sy * png.width + sx) * 4;
      const di = (y * RW + x) * 4;
      out[di] = png.data[si]; out[di + 1] = png.data[si + 1]; out[di + 2] = png.data[si + 2]; out[di + 3] = 255;
    }
  }
  return out;
}

const luma = (d) => { const l = new Float64Array(RW * RH); for (let i = 0, p = 0; i < d.length; i += 4, p++) l[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return l; };

function ssim(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let va = 0, vb = 0, cov = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; va += da * da; vb += db * db; cov += da * db; }
  va /= n; vb /= n; cov /= n;
  const c1 = (0.01 * 255) ** 2, c2 = (0.03 * 255) ** 2;
  return ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2));
}

function mae(a, b) { let s = 0, n = 0; for (let i = 0; i < a.length; i++) { if (i % 4 === 3) continue; s += Math.abs(a[i] - b[i]); n++; } return s / n; }

function edgeMask(l) {
  const m = new Uint8Array(RW * RH);
  for (let y = 1; y < RH - 1; y++) for (let x = 1; x < RW - 1; x++) {
    const i = y * RW + x;
    const gx = l[i - RW + 1] + 2 * l[i + 1] + l[i + RW + 1] - l[i - RW - 1] - 2 * l[i - 1] - l[i + RW - 1];
    const gy = l[i + RW - 1] + 2 * l[i + RW] + l[i + RW + 1] - l[i - RW - 1] - 2 * l[i - RW] - l[i - RW + 1];
    m[i] = Math.sqrt(gx * gx + gy * gy) > 80 ? 1 : 0;
  }
  return m;
}
function iou(a, b) { let inter = 0, uni = 0; for (let i = 0; i < a.length; i++) { const u = a[i] | b[i]; inter += a[i] & b[i]; uni += u; } return uni ? inter / uni : 1; }

const ids = existsSync(OUT)
  ? readdirSync(OUT).filter((f) => f.startsWith('ours-') && f.endsWith('.png')).map((f) => f.slice(5, -4))
  : [];

const scores = {};
for (const id of ids) {
  const refPath = join(REFS, `${id}.png`);
  if (!existsSync(refPath)) { scores[id] = { status: 'no-reference' }; continue; }
  const a = loadResized(join(OUT, `ours-${id}.png`));
  const b = loadResized(refPath);
  const la = luma(a), lb = luma(b);
  const t = { ...thresholds.default, ...(thresholds.perEffect?.[id] || {}) };
  const s = { ssim: +ssim(la, lb).toFixed(4), mae: +mae(a, b).toFixed(2), edgeIoU: +iou(edgeMask(la), edgeMask(lb)).toFixed(4) };
  s.pass = s.ssim >= t.ssim && s.mae <= t.mae && s.edgeIoU >= t.edgeIoU;
  scores[id] = s;
}

writeFileSync(join(dir, 'scores.json'), JSON.stringify(scores, null, 2));
const scored = Object.entries(scores).filter(([, s]) => 'pass' in s);
const passed = scored.filter(([, s]) => s.pass).length;
const noref = Object.values(scores).filter((s) => s.status === 'no-reference').length;
console.log(`pb-verify: ${passed}/${scored.length} passed` + (noref ? ` (${noref} awaiting Photo Booth references)` : ''));
if (process.env.CI && scored.length && passed < scored.length) process.exit(1);
