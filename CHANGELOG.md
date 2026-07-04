# Changelog

All notable changes to PopStrip. This project follows [Semantic Versioning](https://semver.org).
Every version lands on `main`; `main` is always the deployment target for [popstrip.app](https://popstrip.app).

## [Unreleased]

_Next toward **v3.0.0** (add-ons): **AR face overlays** — the daughter's Dizzy Birds (birds & hearts that track your head) — plus face props, frames & themes, all on-device. Tracked: lock effect fidelity against real Photo Booth via the automated `tools/pb-verify` harness (needs a one-time Mac capture)._

## [2.2.0] — 2026-07-03 — Green screen, now in movies 🎬🟢

Green screen graduates from photos to **movie clips**. Pick a backdrop in the
PopStrip booth and record yourself standing on a beach, in outer space, or in
front of your own photo — the background is replaced **live** and baked into the
recording.

### Added

- **Green screen in movie mode.** Any built-in scene (or your uploaded image)
  now composites into recorded clips, exactly as it does for photos. The live
  movie preview shows the final composite, so what you record is what you see.
- **GIF & boomerang inherit the backdrop.** They're sampled off the same
  recording surface, so exporting a clip's GIF or boomerang carries the
  background for free.

### How it works

- The movie recording canvas cuts the segmented person out of the effected frame
  and drops them onto the scene — all **on-device**, using the same self-hosted
  MediaPipe segmentation as photos (lazy-loaded, so the base app is unchanged).
  Segmentation runs at a reduced cadence with last-good-mask reuse, so recording
  stays smooth and never blocks on inference.

### Fixed

- **4-up green-screen photos** could come out as four copies of the last frame —
  the burst frames aliased one shared compositing canvas. Each captured frame is
  now an independent copy.

### Notes

- PopStrip flavour; the faithful Photobooth stays Apple-exact.
- Warps (Bulge, Twirl, …) distort geometry, so their silhouette edges against a
  backdrop are approximate; colour and stylize effects line up cleanly.

## [2.1.0] — 2026-07-03 — Green screen 🟢

Drop yourself onto a **beach, outer space, a sunset — or your own photo**. The
PopStrip booth now replaces your background, entirely on your device.

### Added

- **Backgrounds** in the PopStrip effect browser: **None**, six built-in scenes
  (Green screen, Sunset, Beach, Space, Studio, Party) and **Upload** your own
  image. Pick one and it composites live in the booth and into your photos.
- Backgrounds **stack with effects** — go Sepia on the beach, Comic Book in space.

### How it works

- **100% on-device.** Person segmentation runs locally via MediaPipe — the WASM
  runtime and model are **self-hosted** (no CDN), so nothing is uploaded and it
  works offline after first use. Your uploaded backgrounds stay on your device too.
- **Lazy-loaded.** The segmentation engine downloads only the first time you pick a
  background; the base app is unchanged, and photos taken without a background are
  byte-for-byte identical.

### Notes

- Green screen applies to **photos** for now; **movie clips** are the next step.
- Works in the **PopStrip** flavour — the faithful Photobooth stays Apple-exact.
- Warps (Bulge, Twirl, …) distort geometry, so their silhouette edges against a
  backdrop are approximate; colour and stylize effects line up cleanly.

## [2.0.0] — 2026-07-03 — Video, feature-complete 🎬

**Video is done.** What started as a single webm clip is now a complete capture
mode standing alongside photos. This release graduates the accumulated movie work
into a milestone major — the same way **v1.0.0** marked photos feature-complete.

Nothing new to learn: **v2.0.0 is a graduation, not a new feature.** Every piece
below already shipped and settled in its own minor; the major simply declares the
video arc complete and stable.

### The video story, now complete

- **Movie clips** (from v1.2.0) — record with any effect baked in, optional mic, a
  30-second cap; play back and save/share exactly like a photo, with a ▶ badge in
  the reel. Built on PopStrip's unified effects canvas, so **the live preview is
  precisely what records**.
- **Real mp4 everywhere** (from v1.3.0) — H.264/AAC mp4 on every capable browser via
  WebCodecs, so clips import straight into iOS Photos with accurate duration; webm
  stays the universal fallback.
- **GIF & boomerang** (from v1.6.0) — turn any clip into a looping animated GIF or a
  forward-then-back boomerang, encoded on-device in a background worker.

### Notes

- **No capture code changed in this release.** Photos and clips are byte-for-byte
  identical to v1.6.0; the bump to `2.0.0` is a stability milestone marking the whole
  video feature set complete.
- **Still 100% on-device** — camera, mic, photos, and clips never leave your machine.
- **Next — v3.0.0, add-ons:** green-screen backdrops and AR face overlays (including
  the long-requested _Dizzy Birds_), on-device via MediaPipe. Same nothing-uploaded
  promise.

## [1.6.0] — 2026-07-03 — GIF & boomerang 🎞️

Turn a movie clip into a shareable **animated GIF** — or a **boomerang** that plays
forward then back — right from the review screen. Nothing leaves your device: the
frames are sampled off the same effects canvas you recorded and encoded on-device
in a background worker.

### Added

- **GIF** and **Boomerang** buttons on a movie clip's review — one tap turns the
  clip into a looping animation you can Save or Share like any photo.
- Both capture the **first ~6 seconds** at ~15 fps and loop forever; the boomerang
  plays forward then back for that classic ping-pong.

### Notes

- **Encoding runs in a Web Worker** ([gifenc](https://github.com/mattdesl/gifenc)),
  off the main thread, so the booth stays responsive. The encoder is **lazy-loaded**
  — it's fetched only the first time you export, and the base download is unchanged.
- Frames are sampled from the **same effects canvas the clip was recorded from**, so
  the GIF carries whatever effect you filmed with. Photos & video clips are unchanged.
- Record once, try **both** — GIF and boomerang come from the same take.

## [1.5.0] — 2026-07-03 — Two booth flavours 🎚️

PopStrip is now **two booths in one**. Pick your flavour the first time you visit —
and switch anytime from the new title-bar pill:

- **📷 Photobooth** — the faithful one. Apple's exact effect roster and the classic
  **paged 3×3 grid**, re-skinned as if Photo Booth had shipped on an **iMac G3**:
  glossy Aqua/Platinum gel buttons, a pinstriped title bar, a brushed-metal shelf,
  and a Bondi-blue candy accent.
- **✨ PopStrip** — ours, built to grow. The paged grid gives way to a **scalable
  effect browser**: categories you can scroll (Color · Stylize · Distort), a
  **⭐ Favorites** row you pin yourself, and a **search** box — so the roster can
  keep growing without turning into “15 pages of scrolling.” Keeps the bold 90s look.

### Added

- **First-run “pick your booth”** — a one-time choice, remembered after that.
- **Title-bar flavour pill** to switch booths whenever you like. Switching keeps
  everything else (your shots, modes, camera) exactly where it was.
- **Effect browser** (PopStrip flavour) with **Favorites**, **search**, and labeled,
  jump-to categories. Live previews render only for effects actually on screen, so
  the roster can scale without dropping frames.

### Notes

- **Photos and clips are byte-for-byte unchanged** — flavours change the interface
  and the effect roster on offer, never how a shot is rendered. The Photobooth roster
  stays frozen to Apple's set (so the `pb-verify` accuracy harness stays meaningful);
  new effects, backgrounds and AR will land only in PopStrip.
- The GPU effect engine, pixi and the mp4 encoder stay **lazy-loaded** — the base
  download is essentially unchanged.
- Next: **GIF & boomerang** (v1.6.0), then video feature-complete (v2.0.0).

## [1.4.0] — 2026-07-03 — Authentic-90s refresh + shell

A fresh, genuinely-90s look and a decluttered booth — sharp corners, bold flat
colour, heavy outlines with hard drop-shadows, and a save screen that's finally an
obvious pop-up.

### Changed

- **A whole new (old) look.** PopStrip drops the cartoony faux-retro styling for an
  **authentic-90s** one: square corners, heavy outlines with hard offset shadows,
  bold flat web-safe colour — its new signature is **red** (chosen by the resident
  8-year-old art director) — chunky Impact/Arial type, and a tiled desktop. Louder
  *and* more polished.
- **The save screen is a pop-up.** Your photo or clip now appears as a card over a
  dimmed booth, with **three obvious ways back** — a ✕, tapping outside, or Esc.
- **A tidier top bar.** The six little toggles (theme, timer, mirror, sound, flash,
  fullscreen) tuck behind a single **⚙ Controls** button; the fake window buttons
  are gone.
- **A roomier dock.** Modes on the left, the shutter dead-centre, effects on the
  right — nothing crowds the shutter, and the effect button always just says
  **"Effects."**

### Added

- Small nice-to-haves: the effect's **name flashes** on the feed when you pick it, the
  strength slider shows a **live %**, the reel has a friendly **empty state** and
  clearer **4-up / Strip** tags, and **Save** sticks on a lasting **"Saved ✓."**

### Notes

- Photos and movie clips are **byte-for-byte unchanged** — only the interface did.
- Next: **two "booth flavours"** — a faithful Photobooth and our growing PopStrip,
  with a scalable effect browser (v1.5.0) — then **GIF & boomerang** (v1.6.0).

## [1.3.0] — 2026-07-03 — mp4 everywhere

Movie clips now record as real **mp4 (H.264/AAC) on every capable browser**, not
just Safari — so a clip imports straight into iOS Photos and has an accurate length.

### Added

- **Real mp4 on Chrome, Edge & Firefox** — where a browser previously only
  offered webm, PopStrip now muxes an H.264/AAC mp4 right in the browser via
  WebCodecs (the [Mediabunny](https://mediabunny.dev) toolkit). Still 100%
  on-device; nothing is uploaded.

### Changed

- Recording picks the best encoder automatically: native mp4 where the browser
  records it directly (Safari), the WebCodecs mp4 path where it doesn't
  (Chrome/Firefox), and webm as a universal fallback. The mp4 clips also carry
  **precise duration metadata** (older MediaRecorder mp4s sometimes didn't).

### Notes

- The WebCodecs encoder is **lazy-loaded** only when it's actually needed, so the
  base app stays a tiny download and browsers that don't need it never fetch it.
- Next: **GIF & boomerang** exports (v1.4.0), then video feature-complete (v2.0.0).

## [1.2.1] — 2026-07-03 — Watermark off

### Changed

- **Movie clips no longer carry a burned-in watermark.** The small PopStrip mark
  + date is gone from recordings — a clip is now just the picture. (Photos are
  unchanged; their footer wordmark lives in the print layout, not the frame.)

## [1.2.0] — 2026-07-03 — Movie clips 🎬

The first slice of video: record a movie clip with any effect baked in, right in
the browser — nothing uploaded.

### Added

- **Movie mode** — a third capture mode beside Single and 4-up. Pick it, hit
  record, and PopStrip films your live effect (colour, shader, or warp) into a
  clip. The same countdown leads in; press **Stop** (Space or Esc also work)
  when you're done, or it caps at 30 seconds. **✕ Discard** throws a take away.
- **Optional microphone** — movies record with sound by default, with a mic
  toggle. The mic is opened only while you're actually recording and released
  the instant you stop — it never lingers.
- **Video review + reel** — finished clips play right in the review screen and
  can be **Saved** or **Shared** like any photo; recent clips join the bottom
  reel with a ▶ badge.

### Changed

- Movie mode introduces PopStrip's **unified effects canvas** — one surface that
  is both the live preview and exactly what gets recorded, so a clip is WYSIWYG
  just like a photo. Every clip carries a subtle PopStrip mark + date.

### Notes

- Clips record as **mp4 (H.264)** where the browser supports it — Safari, and
  Chrome/Edge with a hardware encoder — otherwise **webm (VP9/VP8)**; nothing
  extra to download. Broadening mp4 to every browser (so clips import into iOS
  Photos) and adding **GIF / boomerang** is next (v1.3.0), on the way to video
  feature-complete (v2.0.0).
- Recording needs a browser with `MediaRecorder` + canvas capture. Where it's
  unavailable, Movie mode is hidden and photos work exactly as before.

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
