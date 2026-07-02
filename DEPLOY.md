# Deploying PopStrip

PopStrip is a **static site** — a production build is just files in `dist/`. It runs on DreamHost shared hosting with no backend. HTTPS is required (the camera won't work without it) and DreamHost provides it automatically via Let's Encrypt.

## One-time DreamHost setup

1. Point `popstrip.app` at DreamHost and add the domain in the panel.
2. Enable the **free Let's Encrypt SSL** certificate for the domain (Panel → Websites → Secure Certificates). Wait until `https://popstrip.app` loads with a padlock.
3. Make sure you have **SSH/SFTP** access (Panel → Websites → SFTP users). Note your SSH user and host.

## Build & deploy

One command — builds and ships:

```bash
npm run deploy
```

It reads the target from a git-ignored **`scripts/deploy.env`** (never committed):

```bash
DH_HOST=popstrip@iad1-shared-b7-37.dreamhost.com
DH_PATH='~/popstrip.app'   # quote the ~ so it expands on the server, not locally
```

The script uses `rsync` when available and otherwise falls back to `scp` (Windows / Git Bash has no rsync). It needs an SSH key already authorized for `DH_HOST` — set that up once with:

```bash
# from PowerShell / Git Bash
type $HOME/.ssh/id_ed25519.pub | ssh DH_HOST "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Manual equivalent (SFTP / WinSCP / Cyberduck works too — upload everything inside `dist/`, including `.htaccess`):

```bash
npm run build
cd dist && scp -r . DH_HOST:~/popstrip.app/
```

## Behind Cloudflare

`popstrip.app` is fronted by **Cloudflare** (proxied) with DreamHost as the origin (`67.205.31.251`). Two things to keep true:

- Cloudflare **SSL/TLS mode = Full (strict)** — DreamHost serves a valid Let's Encrypt cert on the origin, so Cloudflare should talk to it over HTTPS.
- The proxied `A popstrip.app` record points at the DreamHost web IP. Deploys don't touch DNS — they only replace files in the web root, so the edge picks them up on the next request (HTML is always revalidated).

## Notes

- **`.htaccess`** (shipped in `dist/` from `public/`) handles SPA routing, the `.wasm` MIME type, and caching. If `.wasm` ever 404s with a MIME error, confirm `AddType application/wasm .wasm` is being honored.
- **Cache:** hashed `assets/*` are cached forever; `index.html` is always revalidated, so a redeploy goes live immediately.
- **Camera needs HTTPS** — verify the padlock after DNS/SSL propagate (10–30 min).
