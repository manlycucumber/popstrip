# Changelog

All notable changes to PopStrip. This project follows [Semantic Versioning](https://semver.org).
Every version lands on `main`; `main` is always the deployment target for [popstrip.app](https://popstrip.app).

## [Unreleased]

_Next up is v2.0.0 (video: movie clips, then mp4 & GIF/boomerang). Tracked: lock effect fidelity against real Photo Booth via the automated `tools/pb-verify` harness (needs a one-time Mac capture)._

## [1.1.0] — 2026-07-03 — Photo Booth fidelity

Reconciles the effects and presentation with native macOS Photo Booth, researched
against Apple's docs across versions.

### Added

- **Five more effects**, completing Photo Booth's roster: **Colored Pencil**,
  **Squeeze**, **Mirror**, **Fish Eye**, and **Stretch** — 18 in all.
- **Paged 3×3 effects grid**, just like Photo Booth: a **Color** page, a
  **Distort** page, and a **PopStrip** page, with **Normal always in the centre**
  and arrows + page dots to flip between them.
- **`tools/pb-verify`** — an automated per-effect accuracy harness that renders
  our real shaders against a test chart and (once Photo Booth references are
  captured on a Mac) scores each effect by SSIM / colour error / edge match.

### Changed

- **Photos are now 4:3** — the live preview, capture, and print layouts all share
  one landscape aspect (matching Photo Booth), so what you see is what you save.
- **Effect names match Photo Booth** (Black & White, Glow, Thermal Camera, …).
- **Distortions retuned toward Photo Booth's Core Image defaults** — most visibly,
  **Dent is much deeper** now. Each effect's intensity slider still lets you dial
  it up or down; the defaults just start where Photo Booth sits.

### Notes

- Photo Booth's effects are Apple Core Image filters, so each of ours targets a
  specific one (Bulge ≈ CIBumpDistortion, Twirl ≈ CITwirlDistortion, Comic Book ≈
  CIComicEffect, …). Exact pixel parity for a few effects is pending on-device
  Photo Booth references — see `tools/pb-verify`.

## [1.0.0] — 2026-07-02 — Warps + shader stylize → photos feature-complete 🎉

The version where PopStrip becomes a full Photo Booth for photos: funhouse warps and
shader effects, GPU-accelerated with pixi.js, live and baked identically into every shot.

### Added

- **Funhouse warps** — **Bulge**, **Dent**, **Twirl**, and **Light Tunnel**: real-time
  WebGL distortions of your live face, each with an adjustable strength.
- **Shader stylize** — **Comic Book** (posterized + inked edges), **Dreamy Glow** (soft
  bloom), and **X-Ray** (cold inverted luminance).
- **Effect-strength slider** — a chunky dial next to the effect button, shown for warps
  and shader effects; each effect remembers its own sweet spot.
- **Bigger live effects grid** — the ✨ grid now shows all 13 effects on your live face at
  once (it scrolls), and picks the one you tap. GPU effects share a single renderer so
  the grid stays smooth.
- **Install PopStrip** — it's now a PWA: add it to your home screen or desktop and it
  **works offline** after the first visit, with a proper app icon.

### Notes

- GPU effects use pixi.js v8 (WebGL). pixi is **lazy-loaded** only when a GPU effect is
  first used, so the app still starts as a tiny bundle and the six colour effects need
  nothing extra. On devices without WebGL, the GPU effects are hidden and the colour
  effects work as before.
- What you see live is what gets saved: the same shader and strength are baked into single
  shots, 4-up quads, and strips at full camera resolution.

## [0.3.0] — 2026-07-02 — Color effects + live grid

### Added

- **Six colour effects**, applied live and baked into every photo: **Normal**, **Black & White**, **Sepia**, **Pop Art** (posterized + punched-up colour), **Thermal** (cold-to-hot heat map), and **Vintage**.
- **Live effects grid** — tap ✨ to see your face through every effect at once, then tap one to choose it. (Fills out to the full 3×3 when shader effects land in v1.0.)
- The chosen effect is remembered and baked identically into single shots, 4-up quads, and strips — what you see live is what you save.

### Notes

- Effects are GPU-accelerated CSS/SVG filters (baked on capture via canvas `ctx.filter`) — nothing extra to download. Pop Art & Thermal use inline SVG filters; best in Chromium/Firefox, and rendered in Safari too.

## [0.2.0] — 2026-07-02 — The loop

### Added

- **Countdown** before the shutter (off / 3s / 5s / 10s, in the toolbar) with soft beeps and a big 3·2·1 over the live feed. Press **Esc** to cancel.
- **4-up mode** — the iconic Photo Booth burst: one countdown, then four rapid shots composed into a **2×2 quad**. Now the default; **Single** is still one tap away.
- **Photostrip composition** at print resolution (300 DPI) with a PopStrip footer + date — quad (4"×4.4"), vertical **strip** (2"×6"), and single. On the review screen a 4-up capture can switch between **▦ Grid** and **▤ Strip** layouts.
- **Redo a single shot** of a 4-up without starting over.
- **Bottom photo reel** — recent captures kept on-device (IndexedDB, capped); click one to reopen it, or remove it. Nothing is uploaded.
- **Confetti** celebration on capture (reduced-motion-safe).
- **Mirror toggle** in the toolbar.

### Changed

- Capture now flows through a shared frame → compose pipeline, so single, quad, and strip all share one code path (and video will slot into the same path later).

## [0.1.0] — 2026-07-02 — Skeleton

### Added

- Skeleton photo booth: live mirrored camera preview with device picker.
- Single-photo capture (button or Spacebar) with a reduced-motion-safe white flash and a synthesized shutter sound.
- Review screen with **Save** (folder via File System Access, or download), **Share** (Web Share), and **Copy** (clipboard).
- 90s-web interface with **Light & Dark** modes, persisted settings, and a privacy status line.
- Graceful fallback screen for every camera edge case (no camera, permission denied, camera in use, disconnected, unsupported browser, insecure context).
- Feature detection, `.htaccess` for DreamHost (SPA fallback, wasm MIME, caching), and a basic web app manifest.
