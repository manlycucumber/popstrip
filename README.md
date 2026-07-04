# PopStrip 📸

**A free, fun photo booth right in your browser.** A faithful, modern take on Apple Photo Booth — snap photos and record movie clips with retro effects. Everything runs on your device; **nothing is ever uploaded.**

Live at **[popstrip.app](https://popstrip.app)**.

## What it is

Open it, smile, grab a photo. PopStrip is a static, client-side web app: your camera feed and your photos never leave your machine. It's built to feel like the Photo Booth people remember — the live effects grid, the flash, the strip — but on the web and better.

- 📷 Live camera preview + one-tap capture (Spacebar works too)
- ⏱️ Countdown → flash → shutter, with the iconic **2×2 quad burst** and print-ready photostrips
- 🎨 **The full Photo Booth effect set** — colour (Sepia, Black & White, Pop Art, Thermal Camera, …), **shader stylize** (Comic Book, Glow, X-Ray, Colored Pencil) and **funhouse warps** (Bulge, Dent, Twirl, Squeeze, Mirror, Light Tunnel, Fish Eye, Stretch), each with a strength dial — baked into every shot
- 🎚️ **Two booths, one app** — pick your flavour on first run and switch anytime from the title bar: a faithful **Photobooth** (Apple's roster, the classic paged 3×3 grid, an iMac-G3 Aqua look) or our extensible **PopStrip** (a searchable, favouritable effect browser and the bold 90s look)
- 🎬 **Movie mode** — record a clip with any effect baked in (and optional sound) as a real **mp4** (or webm), then save or share it
- 🎞️ **GIF & boomerang** — turn any movie clip into a looping animated GIF, or a forward-then-back boomerang, encoded on-device in a background worker
- 🟢 **Green screen** (PopStrip booth) — drop yourself onto a beach, outer space, a sunset, or your own photo, in **photos and movie clips**; background replacement runs **on-device** (nothing uploaded) and stacks with any effect
- 🐦 **AR face effects** (PopStrip booth) — **Dizzy Birds** (bluebirds that circle your head) and **Lovestruck** (hearts), plus **face props** you wear (shades, glasses, mustache, clown nose, top hat, crown, puppy) — all face-tracked **on-device**, baked into photos and movie clips, and stackable with any effect, background, and each other
- 🖼️ **Frames** (PopStrip booth) — decorative borders around your picture (Classic, Filmstrip, Comic, Hearts, Stars, Confetti, Tape), drawn procedurally and baked into photos and movie clips; stacks on top of any effect, background, and face effect
- 🎞️ A **reel** of your recent photos and clips, kept on your device
- 💾 Save to a folder, share to your apps, or copy — all local
- 🕹️ Two retro skins with **Light & Dark** modes; works on desktop & mobile
- 📲 **Installable PWA** — add it to your home screen and it works offline
- 🗺️ What's next — see the [Roadmap](ROADMAP.md)

## Develop

Requires Node 20+.

```bash
npm install      # install dependencies
npm run dev      # dev server → http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview the production build
npm run check    # type-check (svelte-check)
```

> Camera access needs a secure context. `localhost` counts for dev; production is always HTTPS.

Stack: [Svelte 5](https://svelte.dev) + [Vite](https://vite.dev), TypeScript, no backend. Deploys as static files (see [DEPLOY.md](DEPLOY.md)).

## Roadmap

[ROADMAP.md](ROADMAP.md) — **photos** (v1.0), **video** (v2.0), then **add-ons** (v3.0). Every release ships live.

## License

[AGPL-3.0-or-later](LICENSE) © 2026 manlycucumber
