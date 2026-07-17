# Deploying PopStrip

PopStrip is a **static site** — a production build is just the files in `dist/`. It runs on any static web host with no backend. **HTTPS is required** (the camera needs a secure context); most hosts provide it via Let's Encrypt, and it also works behind a CDN/proxy that terminates TLS.

## Build & deploy

One command — builds and ships over SSH:

```bash
npm run deploy
```

It reads the target from a git-ignored **`scripts/deploy.env`** (never committed):

```bash
DEPLOY_HOST=user@your-host                    # SSH target
DEPLOY_PATH=~/web/popstrip.app/public_html    # the web docroot on that host
```

The legacy `DH_HOST` / `DH_PATH` names are still accepted as aliases. It needs an SSH key already authorized for `DEPLOY_HOST` (passwordless), uses `rsync` when available, and falls back to `scp` otherwise (Git Bash has no rsync).

Manual equivalent (SFTP / WinSCP / Cyberduck works too — upload everything inside `dist/`, including `.htaccess`):

```bash
npm run build
cd dist && scp -r . DEPLOY_HOST:~/web/popstrip.app/public_html/
```

## Web-server config — pick the one for your host

The app is a single-page PWA. Two things must be right on the origin: the `.wasm` MIME type (`application/wasm`, or MediaPipe breaks) and a cache policy that lets `sw.js` / `index.html` revalidate while content-hashed `/assets/*` stay immutable.

- **Apache** hosts: `public/.htaccess` (shipped inside `dist/`) handles WASM MIME, the SPA fallback, and caching automatically.
- **nginx** hosts (nginx serves static files directly, so `.htaccess` is ignored): install **`deploy/nginx-popstrip.conf`** as a per-domain include (e.g. a HestiaCP `nginx.ssl.conf_*` file) or fold it into the server block, then reload nginx. Modern nginx already maps `application/wasm`; the include adds the `sw.js`/`index.html` cache overrides.

## Behind a CDN / Cloudflare

`popstrip.app` is fronted by **Cloudflare** (proxied). Keep two things true:

- The origin serves **valid HTTPS**, so Cloudflare's Full (or Full-strict) mode is satisfied.
- Content-hashed `/assets/*` are cached forever; `index.html` + `sw.js` revalidate — so a redeploy (with a bumped `sw.js` `CACHE`) reaches clients on the next navigation.

## Notes

- **Camera needs HTTPS** — verify the padlock after any DNS/SSL change.
- **Black screen right after a deploy** → suspect a stale service worker first. Test in incognito (fresh SW/cache); content-hashed assets + a revalidated shell mean new code ships on the next navigation anyway.
