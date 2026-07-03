# Roadmap

_Where PopStrip is headed — a faithful, modern Photo Booth for the web. Last updated: 2026-07-03_

Every release ships **live** to [popstrip.app](https://popstrip.app). `v1.0.0` = **photos feature-complete**; video is `v2.0.0`; add-ons are `v3.0.0`.

## 🚧 Up next — [v1.5.0](https://github.com/manlycucumber/popstrip/milestones) — two booth flavours + a scalable effect browser

**v1.4.0 gave PopStrip an authentic-90s refresh + a decluttered shell.** Next: **two "booth flavours"** — a faithful **Photobooth** (Apple's roster + the classic 3×3 grid) and our growing **PopStrip** (extensible UI) — chosen once on first run and switchable anytime from the title bar, plus a **scalable effect browser** (favorites / recents / search) that replaces the paged grid as the roster grows. Then **v1.6.0** brings **GIF & boomerang** exports, on the way to **v2.0.0** (video feature-complete). Green-screen backdrops + AR (incl. the daughter's _Dizzy Birds_) remain **v3.0.0**.

## 🔭 Later / tracked

- **[v3.0.0](https://github.com/manlycucumber/popstrip/milestone/6) — Add-ons.** Green-screen backdrops, **AR face-tracked overlays — including Photo Booth's _Dizzy_ (blue birds circling your head) and _Lovestruck_ (hearts)**, AR face props (glasses/hats), custom frames & branding, stickers, themes, and a print helper. Face tracking runs on-device (MediaPipe), keeping the nothing-uploaded promise.
- **Lock effect fidelity against real Photo Booth.** The `tools/pb-verify` harness renders our shaders against a test chart and scores each effect vs Photo Booth once references are captured on a Mac (one-time). Calibrate defaults + thresholds, then gate in CI.

## ✅ Released

- **[v1.4.0](https://github.com/manlycucumber/popstrip/releases/tag/v1.4.0) — Authentic-90s refresh + shell.** A genuinely-90s redesign — sharp corners, bold flat colour (new signature **red**), heavy outlines + hard offset shadows, chunky Impact/Arial type, a tiled desktop — replacing the cartoony faux-retro look. The save screen becomes an obvious **modal** (✕ / tap-outside / Esc), the six toolbar toggles tuck behind a **⚙ Controls** menu (fake window buttons gone), and the dock gets three clean zones with the shutter dead-centre. Plus small wins: effect-name toast, live slider %, reel empty-state + clearer tags, and a persistent "Saved ✓". Photos & clips are byte-for-byte unchanged.
- **[v1.3.0](https://github.com/manlycucumber/popstrip/milestone/9) — mp4 everywhere.** Movie clips record as real H.264/AAC **mp4 on every capable browser** — WebCodecs (via [Mediabunny](https://mediabunny.dev)) where MediaRecorder only gave webm (Chrome/Firefox) — so clips import into iOS Photos and carry precise duration. The encoder is lazy-loaded; Safari keeps its native mp4 and webm stays the universal fallback.
- **[v1.2.0](https://github.com/manlycucumber/popstrip/milestone/8) — Movie clips.** Record a movie clip with any effect baked in (colour, shader, or warp), with optional microphone, a 30-second cap, and the same countdown lead-in. Clips play in review, save/share like photos, and join the reel with a ▶ badge — mp4 where supported, else webm, nothing uploaded. Introduces PopStrip's **unified effects canvas** (live preview == recorded output).
- **[v1.1.0](https://github.com/manlycucumber/popstrip/milestone/7) — Photo Booth fidelity.** Reconciled with native Photo Booth: the full effect roster (added Colored Pencil, Squeeze, Mirror, Fish Eye, Stretch — 18 total), a **paged 3×3 grid** with Normal centered, **4:3 photos** (preview = capture = print), Photo-Booth effect names, and distortions retuned toward Core Image defaults (deeper Dent). Plus the `pb-verify` accuracy harness.
- **[v1.0.0](https://github.com/manlycucumber/popstrip/milestone/4) — Warps + shader stylize → photos feature-complete.** WebGL funhouse warps (Bulge, Dent, Twirl, Light Tunnel) and shader effects (Comic Book, Glow, X-Ray) via pixi.js, an effect-strength slider, the full live effects grid, and installable + offline PWA.
- **[v0.3.0](https://github.com/manlycucumber/popstrip/milestone/3) — Color effects + live grid.** Normal, B&W, Sepia, Pop Art, Thermal, Vintage — chosen from a live effects grid and baked into every shot.
- **[v0.2.0](https://github.com/manlycucumber/popstrip/milestone/2) — The loop.** Countdown → flash → shutter, the 2×2 quad burst, print-ready photostrips (grid & strip), single-shot redo, the bottom photo reel, and confetti.
- **[v0.1.0](https://github.com/manlycucumber/popstrip/milestone/1) — Skeleton.** Live mirrored camera preview, single-photo capture, save / share / copy, Light & Dark, and graceful handling when there's no camera.
