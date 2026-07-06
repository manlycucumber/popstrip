// Render PopStrip's effects headlessly against the test chart, writing PNGs to
// out/. Drives render.html (which uses the real production shaders) via
// Playwright, so it exercises the exact GLSL the app ships.
//
// Prereq: the Vite dev server must be running (`npm run dev`), and dev deps
// installed (`npm i -D playwright && npx playwright install chromium`).
// Usage: node tools/pb-verify/render.mjs   (PB_VERIFY_URL overrides the URL)

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(dir, 'out');
const url = process.env.PB_VERIFY_URL || 'http://localhost:5173/tools/pb-verify/render.html';

mkdirSync(OUT, { recursive: true });

// If the Photo Booth slider values have been recorded in refs/manifest.json, feed
// them to our shaders so both sides render at the SAME strength (apples-to-apples).
// Distortion effects only; null-slider effects keep the registry default.
let intensities = null;
const manifestPath = join(dir, 'refs', 'manifest.json');
if (existsSync(manifestPath)) {
  try {
    const eff = JSON.parse(readFileSync(manifestPath, 'utf8')).effects || {};
    intensities = {};
    for (const [id, v] of Object.entries(eff)) if (v && typeof v.slider === 'number') intensities[id] = v.slider;
    if (!Object.keys(intensities).length) intensities = null;
  } catch { /* malformed manifest — fall back to registry defaults */ }
}

// Headless Chromium has no hardware GPU, so pixi's WebGL renderer needs a
// software backend or autoDetectRenderer rejects. SwiftShader via ANGLE gives a
// reliable software WebGL2 context in CI too.
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') console.error('  [page error]', m.text()); });
  page.on('pageerror', (e) => console.error('  [page exception]', e.message));
  if (intensities) {
    await page.addInitScript((v) => { window.__intensities = v; }, intensities);
    console.log('pb-verify: using Photo Booth slider values from manifest:', JSON.stringify(intensities));
  }
  await page.goto(url, { waitUntil: 'networkidle' });
  // Resolves once render.html finishes OR records an error (so we fail loud, not on a blind timeout).
  await page.waitForFunction(() => window.__render && (window.__render.count > 0 || window.__render.error), { timeout: 60000 });
  const data = await page.evaluate(() => window.__render);
  if (data.error) throw new Error(`render.html failed: ${data.error}`);
  const save = (name, dataUrl) => writeFileSync(join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
  save('chart.png', data.chart);
  for (const [id, u] of Object.entries(data.effects)) save(`ours-${id}.png`, u);
  console.log(`pb-verify: wrote ${Object.keys(data.effects).length} renders + chart → ${OUT}`);
} finally {
  await browser.close();
}
