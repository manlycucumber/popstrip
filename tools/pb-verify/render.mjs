// Render PopStrip's effects headlessly against the test chart, writing PNGs to
// out/. Drives render.html (which uses the real production shaders) via
// Playwright, so it exercises the exact GLSL the app ships.
//
// Prereq: the Vite dev server must be running (`npm run dev`), and dev deps
// installed (`npm i -D playwright && npx playwright install chromium`).
// Usage: node tools/pb-verify/render.mjs   (PB_VERIFY_URL overrides the URL)

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(dir, 'out');
const url = process.env.PB_VERIFY_URL || 'http://localhost:5173/tools/pb-verify/render.html';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__render && window.__render.count > 0, { timeout: 30000 });
  const data = await page.evaluate(() => window.__render);
  const save = (name, dataUrl) => writeFileSync(join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
  save('chart.png', data.chart);
  for (const [id, u] of Object.entries(data.effects)) save(`ours-${id}.png`, u);
  console.log(`pb-verify: wrote ${Object.keys(data.effects).length} renders + chart → ${OUT}`);
} finally {
  await browser.close();
}
