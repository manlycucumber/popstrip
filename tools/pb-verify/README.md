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
  chart the Mac side must feed Photo Booth.
- `render.mjs` — Playwright driver → writes `out/ours-<id>.png` + `out/chart.png`.
- `compare.mjs` — per-effect SSIM (luma) + MAE (color) + edge-IoU (warp) vs
  `refs/<id>.png` → `scores.json` (honors `thresholds.json`; exits non-zero under
  `CI` if any effect fails).
- `report.mjs` — `scores.json` + images → `report.html` (ref | ours | metrics).
- `thresholds.json` — pass bars per effect (calibrate on first real run, then freeze).
- `refs/` — Photo Booth reference PNGs (committed) + `manifest.json` (macOS/PB
  version, grid positions, slider values used). **Populated in the Mac session.**
- `out/`, `scores.json`, `report.html` — generated (git-ignored).

## Run the repeatable side (works today, minus references)
```bash
npm i -D playwright pngjs && npx playwright install chromium
npm run dev                         # serve the app (separate terminal)
node tools/pb-verify/render.mjs     # → out/ours-*.png  (real shaders)
node tools/pb-verify/compare.mjs    # → scores.json     (needs refs/ to score)
node tools/pb-verify/report.mjs     # → report.html
```
Until references exist, compare reports every effect as `no-reference` — the
render + report still work, so you can visually diff `out/` immediately.

## One-time Mac capture (deferred)
1. Install **OBS** + start **OBS Virtual Camera**; set an Image source to the
   chart (`out/chart.png`, produced by `render.mjs`, or *Download all* → `chart.png`).
2. Open **Photo Booth**, choose the **OBS Virtual Camera** as its camera. The
   chart now fills the frame — no lighting/pose variance.
3. For each effect: open the Effects grid, click the effect, note the distortion
   **slider** position, take a picture. Photo Booth auto-saves to
   `~/Pictures/Photo Booth Library/Pictures/`.
4. Crop to the frame (use the green corner marks), save as `refs/<id>.png`, and
   record the slider value + macOS/PB version + grid position in
   `refs/manifest.json`. (`capture-pb.applescript` can automate the click+shoot+
   rename loop; a semi-manual pass is fine since it's done once.)
5. Feed the recorded slider values back to the render via `window.__intensities`
   so both sides use the same strength, then calibrate `thresholds.json`.

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
