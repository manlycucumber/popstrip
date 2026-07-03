# Roadmap

_Where PopStrip is headed — a faithful, modern Photo Booth for the web. Last updated: 2026-07-03_

Every release ships **live** to [popstrip.app](https://popstrip.app). `v1.0.0` = **photos feature-complete**; video is `v2.0.0`; add-ons are `v3.0.0`.

## 🚧 Up next — [v2.0.0](https://github.com/manlycucumber/popstrip/milestone/5) — Video

Movie-clip mode (webm) with the same effects pipeline, then mp4 (WebCodecs + mp4-muxer) and GIF / boomerang. Photos are already feature-complete as of v1.0.0.

## 🔭 Later / tracked

- **[v3.0.0](https://github.com/manlycucumber/popstrip/milestone/6) — Add-ons.** Green-screen backdrops, AR face props, custom frames & branding, stickers, themes, and a print helper.
- **Lock effect fidelity against real Photo Booth.** The `tools/pb-verify` harness renders our shaders against a test chart and scores each effect vs Photo Booth once references are captured on a Mac (one-time). Calibrate defaults + thresholds, then gate in CI.

## ✅ Released

- **[v1.1.0](https://github.com/manlycucumber/popstrip/milestone/7) — Photo Booth fidelity.** Reconciled with native Photo Booth: the full effect roster (added Colored Pencil, Squeeze, Mirror, Fish Eye, Stretch — 18 total), a **paged 3×3 grid** with Normal centered, **4:3 photos** (preview = capture = print), Photo-Booth effect names, and distortions retuned toward Core Image defaults (deeper Dent). Plus the `pb-verify` accuracy harness.
- **[v1.0.0](https://github.com/manlycucumber/popstrip/milestone/4) — Warps + shader stylize → photos feature-complete.** WebGL funhouse warps (Bulge, Dent, Twirl, Light Tunnel) and shader effects (Comic Book, Glow, X-Ray) via pixi.js, an effect-strength slider, the full live effects grid, and installable + offline PWA.
- **[v0.3.0](https://github.com/manlycucumber/popstrip/milestone/3) — Color effects + live grid.** Normal, B&W, Sepia, Pop Art, Thermal, Vintage — chosen from a live effects grid and baked into every shot.
- **[v0.2.0](https://github.com/manlycucumber/popstrip/milestone/2) — The loop.** Countdown → flash → shutter, the 2×2 quad burst, print-ready photostrips (grid & strip), single-shot redo, the bottom photo reel, and confetti.
- **[v0.1.0](https://github.com/manlycucumber/popstrip/milestone/1) — Skeleton.** Live mirrored camera preview, single-photo capture, save / share / copy, Light & Dark, and graceful handling when there's no camera.
