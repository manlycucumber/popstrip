# PopStrip 📸

**A free, fun photo booth right in your browser.** A faithful, modern take on Apple Photo Booth — snap photos with retro effects. Everything runs on your device; **nothing is ever uploaded.**

Live at **[popstrip.app](https://popstrip.app)**.

## What it is

Open it, smile, grab a photo. PopStrip is a static, client-side web app: your camera feed and your photos never leave your machine. It's built to feel like the Photo Booth people remember — the live effects grid, the flash, the strip — but on the web and better.

- 📷 Live camera preview + one-tap capture (Spacebar works too)
- ⏱️ Countdown → flash → shutter, with the iconic **2×2 quad burst** and print-ready photostrips
- 🎨 **Live effects** — B&W, Sepia, Pop Art, Thermal, Vintage — picked from a grid and baked into every shot
- 🎞️ A **photo reel** of your recent shots, kept on your device
- 💾 Save to a folder, share to your apps, or copy — all local
- 🕹️ 90s-web look with **Light & Dark** modes; works on desktop & mobile
- 🎬 Funhouse warps and video are on the way — see the [Roadmap](ROADMAP.md)

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
