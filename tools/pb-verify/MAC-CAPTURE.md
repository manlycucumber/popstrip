# One-time Photo Booth reference capture (on a Mac)

This is the **only** part of `pb-verify` that needs a Mac — Photo Booth is
macOS-only. You feed our deterministic test chart into Photo Booth through a
virtual camera, shoot each effect once, and the tooling here aligns + scores them
against our shaders. Budget ~30 minutes; it's done once.

Everything else (`render.mjs`, `crop-refs.mjs`, `compare.mjs`, `report.mjs`) has
been run and validated on Windows already — see `README.md`.

## 0. Prep (once)
```bash
git clone https://github.com/manlycucumber/popstrip && cd popstrip
npm install
npm i -D playwright pngjs && npx playwright install chromium   # already devDeps; installs the browser
brew install --cask obs                                        # OBS Studio for the virtual camera
```

## 1. Produce the chart the Mac will display
```bash
npm run dev                       # terminal A — leave running
npm run verify:render             # terminal B → writes tools/pb-verify/out/chart.png (+ our renders)
```
`out/chart.png` is a 640×480 4:3 chart: a colour-patch strip, a grid + diagonals +
concentric target, and **three corner marks** (orange TL, teal TR, violet BL) that
`crop-refs.mjs` keys on. (You can also open `tools/pb-verify/render.html` and click
*Download all*.)

## 2. Feed the chart to Photo Booth via OBS
1. OBS → Settings → Video → set **Base + Output resolution to 640×480**.
2. Add a **Image** source → `tools/pb-verify/out/chart.png`. Right-click it →
   *Transform → Fit to screen* so it fills the canvas edge-to-edge.
3. **Start Virtual Camera** (button, lower right).
4. Open **Photo Booth** → menu **Camera → OBS Virtual Camera**. The chart now fills
   the frame with no lighting/pose variance. Photo Booth mirrors the preview — that's
   fine, `crop-refs.mjs` un-mirrors it automatically.
5. Put Photo Booth in **single-photo** mode (not 4-up / movie).

## 3. Shoot the calibration frame, then every effect
Shoot **one photo with NO effect first** — this is the geometry calibration
(`_calib.png`). Then, for each effect: open the Effects grid, pick it, **for the
distortions set the slider and write the value down**, and take a photo.

| our id  | Photo Booth effect | slider? |
|---------|--------------------|---------|
| _calib  | Normal (no effect) | —       |
| bulge   | Bulge              | yes     |
| dent    | Dent               | yes     |
| twirl   | Twirl              | yes     |
| squeeze | Squeeze            | yes     |
| mirror  | Mirror             | yes     |
| tunnel  | Light Tunnel       | yes     |
| fisheye | Fish Eye           | yes     |
| stretch | Stretch            | yes     |
| comic   | Comic Book         | no      |
| glow    | Glow               | no      |
| xray    | X-Ray              | no      |
| pencil  | Colored Pencil     | no      |

(The CSS effects — Sepia, Black & White, Pop Art, Thermal Camera — aren't in the
harness yet; the accuracy-critical GPU warps + stylize are. See README "Notes".)

## 4. Collect the captures into `raw/<id>.png`
Photo Booth saves JPEGs to `~/Pictures/Photo Booth Library/Pictures/`. Copy the 13
frames out, **convert to PNG**, and name each by its id (calibration → `_calib.png`):
```bash
mkdir -p tools/pb-verify/raw
# per file, e.g.:
sips -s format png "~/Pictures/Photo Booth Library/Pictures/<file>.jpg" \
     --out tools/pb-verify/raw/dent.png
```
`raw/` is git-ignored (only the aligned `refs/` get committed).

## 5. Align → reference images
```bash
npm run verify:crop      # tools/pb-verify/crop-refs.mjs → refs/<id>.png (aligned, un-mirrored, 640×480)
```
It prints the detected corner-mark positions. If a mark "not found", the chart
wasn't fully in frame or was too dim — re-shoot `_calib`.

## 6. Record provenance + slider values
Fill in `tools/pb-verify/refs/manifest.json`: `capturedOn`, `macosVersion`,
`photoBoothVersion`, and each distortion's `slider` value. `render.mjs` reads those
sliders and renders our shaders at the **same** strength.

## 7. Score + report
```bash
npm run verify:render     # re-render OURS at the manifest slider values
npm run verify:effects     # compare.mjs + report.mjs
open tools/pb-verify/report.html   # ref | ours | metrics, worst-first
```

## 8. Calibrate + commit
Look at `report.html` worst-first. Adjust each effect's shader constants in
`src/lib/gpu/shaders.ts` toward the reference where it's clearly off (the open
questions: Dent bump-vs-pinch, Squeeze radius, Light Tunnel ring-freeze-vs-fold,
etc.). Set `thresholds.json` just above the achieved scores so future regressions
fail. Commit `refs/*.png` + `refs/manifest.json` + `thresholds.json`. CI then runs
`CI=1 npm run verify:effects` and fails on regressions.
