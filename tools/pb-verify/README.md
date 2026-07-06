# pb-verify — automated PopStrip ⇄ Photo Booth accuracy harness

Goal: **automatically** measure how closely each PopStrip effect matches native
macOS Photo Booth, per filter — no manual eyeballing. Photo Booth's effects are
Apple **Core Image** filters, so PopStrip's shaders target the same math; this
harness quantifies the remaining gap and gates regressions.

It splits into a **one-time capture on a Mac** (reference images, committed) and
a **fully repeatable render + compare** (any OS, CI-able).

```
 test chart ─► [Mac, once] Photo Booth (fed the chart via OBS virtual cam) ─► refs/<effect>.png   (committed)
 test chart ─► [any OS]     PopStrip real shaders (Playwright + pixi)       ─► out/ours-<effect>.png
 refs + out ─► compare (SSIM · ΔE/MAE · edge-IoU) ─► scores.json ─► report.html   (worst-first)
```

## Files
- `render.html` — draws the deterministic 4:3 **test chart** and renders every GPU
  effect through the **real** `src/lib/gpu/shaders.ts` via pixi. Open in a browser
  (click *Download all*) or drive headlessly with `render.mjs`. This is the same
  chart the Mac side feeds Photo Booth. The chart carries **three distinct corner
  marks** (orange TL / teal TR / violet BL) that `crop-refs.mjs` keys on.
- `render.mjs` — Playwright driver → `out/ours-<id>.png` + `out/chart.png`. Launches
  Chromium with software WebGL (SwiftShader) so it renders headlessly / in CI, and
  reads the Photo Booth slider values from `refs/manifest.json` so our shaders match.
- `crop-refs.mjs` — turns raw Photo Booth captures (`raw/<id>.png`) into aligned
  references (`refs/<id>.png`): finds the corner marks in a no-effect calibration
  frame, solves an affine map (auto-correcting Photo Booth's **mirror** + framing),
  and resamples every capture onto the canonical 640×480 grid.
- `compare.mjs` — per-effect SSIM (luma) + MAE (color) + edge-IoU (warp) vs
  `refs/<id>.png` → `scores.json` (honors `thresholds.json`; exits non-zero under
  `CI` if any effect fails).
- `report.mjs` — `scores.json` + images → `report.html` (ref | ours | metrics).
- `thresholds.json` — pass bars per effect (calibrate on first real run, then freeze).
- `refs/` — Photo Booth reference PNGs (committed) + `manifest.json` (macOS/PB
  version + per-effect slider values). Populated in the one-time Mac session.
- `MAC-CAPTURE.md` — the turnkey step-by-step for that Mac session.
- `out/`, `raw/`, `scores.json`, `report.html` — generated (git-ignored).

## Run the repeatable side (validated on Windows; CI-ready)
```bash
npm i -D playwright pngjs && npx playwright install chromium
npm run dev             # serve the app (separate terminal)
npm run verify:render   # → out/ours-*.png + out/chart.png  (real shaders, headless)
npm run verify:effects  # → scores.json + report.html
```
Until references exist, compare reports every effect as `no-reference` — the render
+ report still work, so you can visually diff `out/` immediately. Once you have raw
Photo Booth captures, `npm run verify:crop` builds the aligned `refs/`.

## One-time Mac capture
See **[MAC-CAPTURE.md](./MAC-CAPTURE.md)** — feed `out/chart.png` into Photo Booth
via an OBS virtual camera, shoot a no-effect calibration frame + one frame per
effect, drop them in `raw/`, then `npm run verify:crop` aligns them into `refs/`.
Record the slider values in `refs/manifest.json`, re-run `verify:render` +
`verify:effects`, and calibrate `thresholds.json`.

## Open accuracy questions this answers (see the plan)
Dent = `CIBumpDistortion`-negative vs `CIPinchDistortion` · Squeeze radius ·
Light Tunnel ring-freeze vs triangle-fold · Pop Art single vs Warhol tiles ·
exact aspect (4:3 vs 3:2) + pixel dims · 4-up inter-frame interval.

## Notes
- Currently covers the **GPU** effects (the accuracy-critical warps + stylize).
  CSS effects (Sepia, Pop Art, Thermal, …) can be added to `render.html` by
  applying `effectCss(id)` via canvas `ctx.filter` (Pop Art/Thermal need the
  `FxDefs` SVG inlined). 
- Metrics are coarse whole-image measures for now (great for ranking + regression
  gating). Refinements once refs exist: align via the green corner marks, windowed
  SSIM, patch-only CIEDE2000 on the color band.
