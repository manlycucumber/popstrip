// Normalize raw Photo Booth captures into aligned references.
//
// Photo Booth (fed the test chart via an OBS virtual camera) saves frames that
// are MIRRORED and framed differently than our chart. This tool finds the three
// coloured corner marks in a clean calibration capture, solves the affine map
// from chart space → capture space (which inherently corrects the mirror, scale
// and offset), and resamples every raw capture onto the canonical 640×480 chart
// grid — so compare.mjs sees apples-to-apples.
//
// Geometry is solved ONCE from a NO-EFFECT calibration capture (raw/_calib.png,
// or raw/normal.png) and reused for every effect. This is deliberate: the
// OBS→Photo Booth framing (chart → capture pixels) is constant across a session,
// so the same affine un-frames/un-mirrors every capture while PRESERVING the warp
// we're measuring. We must NOT re-detect marks on a warped effect capture — there
// the marks have moved WITH the effect, and "correcting" to them would cancel out
// the very distortion under test.
//
//   tools/pb-verify/raw/_calib.png   ← one no-effect capture of the chart (solves geometry)
//   tools/pb-verify/raw/<id>.png     ← one capture per effect (dent, twirl, comic, …)
//        │  node tools/pb-verify/crop-refs.mjs
//        ▼
//   tools/pb-verify/refs/<id>.png    ← 640×480, aligned, un-mirrored  → commit these
//
// Prereq: `npm i -D pngjs`. Photo Booth saves JPEG; convert first, e.g.
//   sips -s format png raw-jpg/*.jpg --out raw/     (macOS)
// Usage: node tools/pb-verify/crop-refs.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

const dir = dirname(fileURLToPath(import.meta.url));
const RAW = join(dir, 'raw');
const REFS = join(dir, 'refs');

// Canonical chart size + the three corner marks, kept in sync with render.html's
// drawChart(): { canonical x, y, target colour }.
const W = 640, H = 480;
const MARKS = [
  { x: 22, y: 72, rgb: [255, 122, 0] }, // TL orange  #ff7a00
  { x: W - 22, y: 72, rgb: [0, 179, 164] }, // TR teal   #00b3a4
  { x: 22, y: H - 22, rgb: [138, 43, 226] }, // BL violet #8a2be2
];

function readPng(path) {
  return PNG.sync.read(readFileSync(path));
}

// Locate each corner mark by colour. A pixel is a candidate for a mark if it's
// colourful (max−min > 55) and that mark is its nearest target within DIST — so
// the mirror never matters (marks are found by colour, not position). To resist
// contamination from the saturated colour patches, we take the MEDIAN of the
// candidates (robust to scattered outliers), then refine to the mean of the dense
// core within REFINE px of that median.
function median(a) { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; }

function findMarks(png) {
  const DIST2 = 85 * 85;
  const REFINE = 45;
  const d = png.data, w = png.width, h = png.height;
  const xs = MARKS.map(() => []), ys = MARKS.map(() => []);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) < 55) continue; // skip greys
      let best = -1, bestD = DIST2;
      for (let m = 0; m < MARKS.length; m++) {
        const [mr, mg, mb] = MARKS[m].rgb;
        const dd = (r - mr) ** 2 + (g - mg) ** 2 + (b - mb) ** 2;
        if (dd < bestD) { bestD = dd; best = m; }
      }
      if (best >= 0) { xs[best].push(x); ys[best].push(y); }
    }
  }
  return MARKS.map((mk, m) => {
    if (xs[m].length < 12) throw new Error(`corner mark ${m} (rgb ${mk.rgb}) not found in the calibration capture (only ${xs[m].length} px) — check the chart is fully in frame and well lit`);
    const cx = median(xs[m]), cy = median(ys[m]);
    let sx = 0, sy = 0, n = 0;
    for (let k = 0; k < xs[m].length; k++) {
      if (Math.abs(xs[m][k] - cx) <= REFINE && Math.abs(ys[m][k] - cy) <= REFINE) { sx += xs[m][k]; sy += ys[m][k]; n++; }
    }
    // If the refine window caught nothing (scattered/bimodal candidates whose x- and
    // y-medians land in a gap), fall back to the robust median point rather than
    // dividing 0/0 into a NaN centroid that would silently corrupt the affine.
    const x = n > 0 ? sx / n : cx;
    const y = n > 0 ? sy / n : cy;
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`corner mark ${m} (rgb ${mk.rgb}) gave a non-finite centroid — re-shoot the calibration frame`);
    return { x, y, n };
  });
}

// Solve a 3×3 system by Cramer's rule.
function solve3(A, y) {
  const det = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-9) throw new Error('degenerate marker geometry (collinear?)');
  const col = (c) => A.map((row, i) => row.map((v, j) => (j === c ? y[i] : v)));
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
}

// Affine mapping canonical chart (xc,yc) → capture (xs,ys), from the 3 marks.
function solveAffine(src) {
  const A = MARKS.map((m) => [m.x, m.y, 1]); // canonical coords
  const ax = solve3(A, src.map((p) => p.x)); // xs = ax·[xc,yc,1]
  const ay = solve3(A, src.map((p) => p.y)); // ys = ay·[xc,yc,1]
  return { ax, ay };
}

function bilinear(png, fx, fy, out, di) {
  const w = png.width, h = png.height;
  // Fractional weights from the UNclamped floor (correct even out of bounds), then
  // clamp the sample coords to the edge (clamp-to-edge boundary mode).
  const fX = Math.floor(fx), fY = Math.floor(fy);
  const tx = fx - fX, ty = fy - fY;
  const cl = (v, hi) => (v < 0 ? 0 : v > hi ? hi : v);
  const x0 = cl(fX, w - 1), y0 = cl(fY, h - 1);
  const x1 = cl(fX + 1, w - 1), y1 = cl(fY + 1, h - 1);
  const d = png.data;
  for (let c = 0; c < 3; c++) {
    const p00 = d[(y0 * w + x0) * 4 + c], p10 = d[(y0 * w + x1) * 4 + c];
    const p01 = d[(y1 * w + x0) * 4 + c], p11 = d[(y1 * w + x1) * 4 + c];
    const top = p00 + (p10 - p00) * tx, bot = p01 + (p11 - p01) * tx;
    out[di + c] = (top + (bot - top) * ty) | 0;
  }
  out[di + 3] = 255;
}

function warpToCanonical(png, aff) {
  const out = new PNG({ width: W, height: H });
  const { ax, ay } = aff;
  const w = png.width, h = png.height;
  let oob = 0; // count canonical pixels that map outside the capture (chart didn't fill the frame)
  for (let yc = 0; yc < H; yc++) {
    for (let xc = 0; xc < W; xc++) {
      const fx = ax[0] * xc + ax[1] * yc + ax[2];
      const fy = ay[0] * xc + ay[1] * yc + ay[2];
      if (fx < 0 || fx > w - 1 || fy < 0 || fy > h - 1) oob++;
      bilinear(png, fx, fy, out.data, (yc * W + xc) * 4);
    }
  }
  return { out, oob };
}

// --- Run ------------------------------------------------------------------
if (!existsSync(RAW)) {
  console.error(`pb-verify: no raw/ dir at ${RAW}. Put Photo Booth captures there (see MAC-CAPTURE.md).`);
  process.exit(1);
}
mkdirSync(REFS, { recursive: true });

const calibName = ['_calib.png', 'normal.png'].find((n) => existsSync(join(RAW, n)));
if (!calibName) {
  console.error('pb-verify: need a no-effect calibration capture at raw/_calib.png (or raw/normal.png) to solve the geometry.');
  process.exit(1);
}
const calib = readPng(join(RAW, calibName));
const src = findMarks(calib);
console.log(`pb-verify: calibrated from ${calibName} — marks at ${src.map((p) => `(${p.x | 0},${p.y | 0})`).join(' ')}`);
const aff = solveAffine(src);

const inputs = readdirSync(RAW).filter((f) => f.endsWith('.png') && !f.startsWith('_'));
let wrote = 0;
for (const f of inputs) {
  const id = f.slice(0, -4);
  const png = readPng(join(RAW, f));
  const { out, oob } = warpToCanonical(png, aff);
  if (oob / (W * H) > 0.005) {
    console.warn(`  ⚠ ${id}: ${((100 * oob) / (W * H)).toFixed(1)}% of the chart maps outside the capture (edge pixels clamped) — re-frame OBS so the chart fills the frame edge-to-edge.`);
  }
  writeFileSync(join(REFS, `${id}.png`), PNG.sync.write(out));
  wrote++;
}
console.log(`pb-verify: wrote ${wrote} aligned reference(s) → ${REFS}`);
