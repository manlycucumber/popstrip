# PopStrip

> Coder / dev-container handoff brief. Written to be accurate against the actual repo at
> `v2.5.0` (branch `main`, working tree clean). A new Claude Code session and the person
> building the dev container can both start from this file.

## Snapshot (at a glance)

- **Runtime:** Node.js — **≥ 20.19 or ≥ 22.12** (required by Vite 8). Developed on **Node 24.18.0 / npm 11.16.0**. No `.nvmrc`; pick an LTS ≥ 22 for the container.
- **Package manager:** **npm** (there is a committed `package-lock.json`; do not switch to pnpm/yarn).
- **Backing services:** **NONE.** 100% client-side static web app — no server, no database, no Redis, no cache tier. All "AI" (face tracking, background segmentation) runs **on-device** via self-hosted MediaPipe WASM. Nothing is ever uploaded.
- **Install:** `npm install` — turnkey from a fresh clone (a `predev`/`prebuild` hook copies the MediaPipe WASM runtime out of `node_modules` into `public/`; the `.tflite` models are already committed).
- **Run (dev):** `npm run dev` → **http://localhost:5173** (Vite default; not overridden).
- **Build:** `npm run build` → static files in `dist/`   |   **Preview build:** `npm run preview` → **:4173** (strict port)
- **Test / Static gate:** `npm run check` (svelte-check type-check — there is no unit-test runner). Effect-accuracy harness: `tools/pb-verify` (see below).
- **Default branch:** `main` (only permanent branch; always deployable). Remote: `https://github.com/manlycucumber/popstrip.git`.

## Overview

PopStrip is a **free, fun, browser-based photo booth** — a faithful, modern take on Apple's **Photo Booth**, built for the owner's daughter (the north-star user) who missed the original. Live in production at **https://popstrip.app**.

It is a **static, client-side Svelte app with no backend**: the camera feed and every photo/clip stay on the device (privacy is a headline feature). Maturity is **high** — photos went feature-complete at `v1.0.0`, video at `v2.0.0`, and the project is now shipping add-ons on the way to `v3.0.0`. Current release: **`v2.5.0`**.

Feature surface today: live mirrored preview + one-tap capture (single / **2×2 quad burst** / **movie clip**), print-ready photostrips, the **full Photo Booth effect roster** (CSS colour + GPU shader stylize + funhouse warps, each with an intensity dial), **movie mode** recorded to real **mp4** (WebCodecs) or webm, **GIF + boomerang** export, on-device **green screen**, on-device **AR** (Dizzy Birds / Lovestruck overlays + wearable face props), procedural **frames**, an on-device **reel** (IndexedDB), local save/share/copy, and an **installable offline PWA**. Two selectable "**flavors**" (a faithful *Photobooth* and the extensible *PopStrip*) share one codebase.

## Architecture

**Stack:** Svelte 5 (runes: `$state`/`$derived`/`$effect`/`$props`) + Vite 8 + TypeScript, `build.target: es2022`. No framework backend. Deploys as static files.

**Key dependencies (all heavy ones are lazy-loaded into their own chunks — base entry ≈ 49 KB gz):**
- `pixi.js` ^8 — the single WebGL renderer for GPU stylize/warp effects.
- `mediabunny` ^1.50 — WebCodecs mp4 muxing (real mp4 on Chrome/Firefox; Safari uses native MediaRecorder mp4).
- `@mediapipe/tasks-vision` ^0.10 — on-device `ImageSegmenter` (green screen) + `FaceDetector` (AR). WASM self-hosted, models committed.
- `gifenc` ^1 — GIF/boomerang encoding inside a Web Worker.
- Dev: `svelte`, `@sveltejs/vite-plugin-svelte`, `svelte-check`, `typescript`, `vite`, plus `playwright` + `pngjs` for the pb-verify harness.

**Source layout (`src/`):**
- `App.svelte` — top-level orchestrator: screen state (booth ⇄ review), capture/record orchestration, `Esc` priority handling, settings persistence, lazy worker wiring.
- `app.css` — the whole design system; two retro skins (authentic-90s **PopStrip** red look + **Photobooth** iMac-G3 Aqua) driven by `[data-flavor]`, plus light/dark.
- `lib/components/` — `Booth.svelte` (live booth, dock, all the render loops, the fixed 960×720 movie canvas, AR/frame overlay canvases), `Review.svelte`, `Reel.svelte`, `EffectGrid.svelte` (Photobooth paged 3×3), `EffectBrowser.svelte` (PopStrip scrollable/searchable/favoritable browser), `Modal.svelte`, `Controls.svelte`, `Countdown.svelte`, `Fallback.svelte` (camera-error screens), `FlavorPicker.svelte` (first-run), `FxDefs.svelte` (inline SVG filter defs for Pop Art / Thermal).
- `lib/effects.ts` — the effect registry (CSS + GPU), flavor `collections`, roster/filter helpers.
- `lib/gpu/{renderer.ts,shaders.ts}` — the single pixi renderer + GLSL fragments (warps + stylize).
- `lib/capture.ts` + `lib/strip.ts` — grab frames (mirror/`ctx.filter`) + compose photostrips (single / quad / strip, 4:3 cells at 300 DPI, brand footer).
- `lib/record.ts` + `lib/record-mp4.ts` — `RecorderBackend` interface + `createRecorder()` factory (MediaRecorder vs Mediabunny mp4).
- `lib/gif.ts` + `lib/gif.worker.ts` — movie-canvas frame sampler + gifenc worker (GIF + boomerang).
- `lib/segment.ts` + `lib/backgrounds.ts` — MediaPipe segmentation + backdrop compositor (off the pixi path).
- `lib/face.ts` + `lib/overlay.ts` — MediaPipe face tracking + procedural AR overlays/props (`drawAR`).
- `lib/frames.ts` — procedural decorative frames (`drawFrame`).
- `lib/settings.svelte.ts` — persisted reactive settings (localStorage). `lib/history.svelte.ts` — IndexedDB reel.
- Supporting: `lib/{camera.svelte.ts,save.ts,share.ts,support.ts,sound.ts,confetti.ts,pwa.ts}` and ambient types (`fs-access.d.ts`, `gifenc.d.ts`).
- `tools/pb-verify/` — a committed effect-accuracy regression harness (details in *Current State*).

**Load-bearing invariants — a new session must not break these:**
1. **Single pixi renderer.** Exactly **one** `renderLive()` consumer per animation frame. `Booth.svelte` has **three mutually-exclusive base loops** (GPU preview / movie / green-screen), and the `EffectGrid`/`EffectBrowser` preview loops are gated behind `gridOpen` so they can never run alongside a base loop.
2. **AR overlays and frames are ADDITIVE top layers, never render paths.** They **never call `renderLive`** — they draw over whatever base is showing (CSS video / GPU canvas / green-screen composite / movie canvas). Frames are the static version (no model, no rAF loop).
3. **Effects apply at three parallel paths** (photo-CSS in `capture.ts`, photo-GPU via `gpu/renderer.ts`, movie unified canvas in `Booth.svelte`) with **no shared abstraction**. A `pipeline.ts` convergence has been deliberately deferred every release so far — do not undertake it casually; if you do, it must be one pixel-diffed step at a time gated by pb-verify.
4. **Heavy deps stay lazy.** pixi / mediabunny / mediapipe / the gif worker must never leak into the base bundle — confirm the base entry stays ≈ 49 KB gz after any change.

Long-lived branches: only `main`. Feature work branches `feature/<slug>` and squash-merges back (see `CONTRIBUTING.md`).

## Dev Environment  (BE PRECISE — a container is built from this)

**Runtime:** Node.js **≥ 20.19 (or ≥ 22.12)** — this is Vite 8's hard floor. The project is developed on **Node 24.18.0** with **npm 11.16.0**. There is **no `.nvmrc`**; provision an LTS ≥ 22 (Node 24 also fine). Git and a POSIX shell (`bash`) are needed for the deploy script.

**No system services to provision.** There is no MySQL/Postgres/Redis/message-queue/backend of any kind. Do **not** add service containers. The only runtime "service" is the **browser** (camera via `getUserMedia`, which requires a *secure context*) and the on-device MediaPipe WASM the app serves from its own origin.

**Install / build / run:**
```bash
npm install          # installs deps; predev/prebuild hook then copies MediaPipe WASM → public/mediapipe/wasm/
npm run dev          # Vite dev server → http://localhost:5173   (predev copies WASM first)
npm run build        # → dist/ (static)                          (prebuild copies WASM first)
npm run preview      # serve the built dist/ → http://localhost:4173 (strict port)
npm run check        # svelte-check type-check (the CI/static gate)
```
- **Ports:** dev **5173**, preview **4173** — both must be forwarded/exposed by the container.
- **First-run hook:** `scripts/copy-mediapipe-wasm.mjs` (wired as `predev` + `prebuild`) copies `vision_wasm_internal.{js,wasm}` (~11 MB, git-ignored) from `node_modules/@mediapipe/tasks-vision/wasm` into `public/mediapipe/wasm/`. It runs automatically; if it errors with "missing … run npm install first", `node_modules` is incomplete. The `.tflite` models (`blaze_face_short_range`, `selfie_segmenter`) **are** committed under `public/mediapipe/models/`.
- **Secure context / camera:** `localhost` counts as secure, so `getUserMedia` is *permitted* in dev — but a **headless/cloud container has no physical webcam**, so live-camera behavior cannot be exercised there (see the standing caveat under *Current State*).

**Effect-accuracy harness (`tools/pb-verify`, optional, runs anywhere):**
```bash
npx playwright install chromium        # + `npx playwright install-deps` on Debian/Ubuntu containers
npm run dev                            # in a second terminal (the harness drives the running app)
npm run verify:render                  # real production shaders/CSS → tools/pb-verify/out/*.png (headless, SwiftShader)
npm run verify:effects                 # compare vs refs → scores.json + report.html
npm run verify:crop                    # (only once real Mac Photo Booth captures exist in raw/) align → refs/
```

**Config files / env / secrets:**
- The **app itself has no runtime env vars and no secrets** — there is no `.env`, no API keys, nothing to inject. It's a static client.
- The **only** config is **`scripts/deploy.env`** — **git-ignored, machine-local, must be recreated by hand** on any new machine. It holds the deploy target only (no secret values live in the repo):
  ```bash
  DH_HOST=<sshuser>@<host>.dreamhost.com   # e.g. popstrip@iad1-shared-XX-XX.dreamhost.com
  DH_PATH='~/popstrip.app'                 # quote the ~ so it expands on the server
  ```
  Deploy also requires an **SSH key already authorized on `DH_HOST`** (passwordless). See `DEPLOY.md`.
- **Deploy:** `npm run deploy` → `scripts/deploy.sh` builds then ships `dist/` to DreamHost shared hosting via `rsync` (falls back to `scp` when rsync is absent, e.g. Git Bash on Windows). Production is fronted by **Cloudflare** (proxied, SSL Full-strict) with DreamHost as origin. HTTPS is DreamHost's automatic Let's Encrypt.
- **No DB migrations or seeders** — the only client-side persistence is `localStorage` (settings) and IndexedDB (the reel), both created lazily by the app.

## Current State & Work in Progress

**Done and live:** everything through **`v2.5.0`** is shipped, tagged, released on GitHub, and deployed to popstrip.app. The arc: photos feature-complete (`v1.0.0`) → video feature-complete (`v2.0.0`) → add-ons: green-screen (`v2.1.0`/`v2.2.0`, edge-quality refinement `v2.2.1`), AR Dizzy Birds/Lovestruck (`v2.3.0`), face props (`v2.4.0`), frames (`v2.5.0`). Full per-release detail is in `CHANGELOG.md` and `ROADMAP.md`.

**Working tree:** **clean** — nothing uncommitted, nothing unpushed (local `main` == `origin/main`). There are **no in-flight changes to carry over.**

**What was actively in progress (a documentation/tooling thread, not app code):** hardening the **`tools/pb-verify`** accuracy harness that measures how closely PopStrip's shaders/CSS match native macOS Photo Booth. Completed and committed this session (`def3efa`, `e376af6`): the harness now renders **all 17 Photo-Booth-mapped effects** headlessly (12 GPU + 5 CSS, incl. the SVG-filter Pop Art/Thermal), with robust auto-alignment (colored corner marks + affine + median detection) validated synthetically, and a turnkey Mac-capture runbook.

**Immediate next step (blocked on the user, needs physical hardware):** the **one-time Photo Booth reference capture must be done on a Mac** (Photo Booth is macOS-only) — feed `tools/pb-verify/out/chart.png` into Photo Booth via an OBS virtual camera, shoot the calibration frame + one frame per effect, `npm run verify:crop`, commit `refs/`. Full step-by-step is `tools/pb-verify/MAC-CAPTURE.md`. After that lands, the remaining work is: score → tune shader constants worst-first → freeze `thresholds.json` → wire the `CI=1 npm run verify:effects` gate.

**Next feature work (toward `v3.0.0` = add-ons feature-complete; not started, needs a go-ahead):** **themes** and **print**; **face paint** is where a MediaPipe Face **Landmarker** (478-pt mesh) would finally be justified (current AR uses only the lightweight 6-keypoint FaceDetector).

**Known blockers / open questions:**
- **The standing webcam caveat.** On-camera quality of **green-screen mask** and **AR face tracking** can only be validated on a **real webcam** — the preview/dev browser has none, and synthetic harnesses validate render/anchor/compositing but not detection quality. The daughter's real webcam is the only unverified gate for those features (edges were partly validated on a real face at `v2.2.1`).
- A low-priority cosmetic follow-up was noted: the photostrip footer in `src/lib/strip.ts` still uses the old pink `#ff2e88` / Verdana rather than the `#e5202b` red brand — optional, not started.

## Conventions & Gotchas

- **Attribution (hard rule, overrides any global tooling default):** **never record the assistant/agent as a contributor.** No co-author trailers, no "Generated with…" lines, no tool emojis, no assistant email addresses — in commits, PRs, comments, or files. **Commit only under the owner's identity:** `manlycucumber <98245399+manlycucumber@users.noreply.github.com>` (already the repo's `git config`). Assistant working files stay out of the repo.
- **Workflow tier: Standard** (recorded on the `**Workflow:**` line of `CONTRIBUTING.md`). Each release = a single direct-to-`main` commit + annotated tag `vX.Y.Z` + GitHub release + `npm run deploy`. The owner has **standing authorization to cut releases and auto-deploy** without asking each version. If the `~/.claude/workflows/` system is present in the new environment, recreate the machine-local, never-committed `CLAUDE.local.md` at the repo root containing the single line `@~/.claude/workflows/development-workflow.md`.
- **SemVer by hand:** add-ons ship in `v2.x` minors and graduate at `v3.0.0`. Bump `package.json` **and** the service-worker cache name in `public/sw.js` (`const CACHE = 'popstrip-vX_Y_Z'`) on every release, or clients keep the stale shell. Update `CHANGELOG.md` + `ROADMAP.md`.
- **Camera can't be tested in the container.** Anything gated on a live feed (effect previews on a real face, green-screen, AR tracking, movie recording) needs the owner's webcam. Verify what you *can* headlessly (`npm run check`, `npm run build`, the boot path with the camera-blocked fallback, the pb-verify renders) and be explicit that on-camera behavior is unverified.
- **`git status` shows `dist/` and `public/mediapipe/wasm/` as ignored, by design** — both are build artifacts (`.gitignore`). Never commit them. `scripts/deploy.env` is likewise ignored and must be recreated locally.
- **Static-host quirks live in `public/.htaccess`** (SPA rewrite, `AddType application/wasm .wasm`, cache headers) — it ships inside `dist/`. If `.wasm` 404s or MIME-errors in prod, that file is the first suspect.
- **Verification discipline that's held all along:** UI/chrome changes must keep the effect *renders* pixel-identical (pb-verify is the gate); heavy deps must stay lazy; the single-pixi-renderer + additive-overlay invariants above are the things most likely to break subtly. New rAF loops touching `renderLive` get reviewed against the one-consumer rule.
- **No CDN, ever.** MediaPipe WASM + models are self-hosted to keep the "nothing uploaded / works offline" promise. Don't reintroduce a CDN fetch.
