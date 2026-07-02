# Deploying PopStrip

PopStrip is a **static site** — a production build is just files in `dist/`. It runs on DreamHost shared hosting with no backend. HTTPS is required (the camera won't work without it) and DreamHost provides it automatically via Let's Encrypt.

## One-time DreamHost setup

1. Point `popstrip.app` at DreamHost and add the domain in the panel.
2. Enable the **free Let's Encrypt SSL** certificate for the domain (Panel → Websites → Secure Certificates). Wait until `https://popstrip.app` loads with a padlock.
3. Make sure you have **SSH/SFTP** access (Panel → Websites → SFTP users). Note your SSH user and host.

## Build & deploy

```bash
npm run build          # → dist/
# then upload the CONTENTS of dist/ to the domain's web directory, e.g.:
rsync -avz --delete dist/ USER@popstrip.app:~/popstrip.app/
```

Or use the helper script (fills in the rsync for you):

```bash
DH_HOST=USER@popstrip.app DH_PATH=~/popstrip.app bash scripts/deploy.sh
```

Replace `USER` and the path with your DreamHost SFTP user and the domain's directory. SFTP (WinSCP / Cyberduck) works too — just upload everything inside `dist/` (including the `.htaccess`) to the web root.

## Notes

- **`.htaccess`** (shipped in `dist/` from `public/`) handles SPA routing, the `.wasm` MIME type, and caching. If `.wasm` ever 404s with a MIME error, confirm `AddType application/wasm .wasm` is being honored.
- **Cache:** hashed `assets/*` are cached forever; `index.html` is always revalidated, so a redeploy goes live immediately.
- **Camera needs HTTPS** — verify the padlock after DNS/SSL propagate (10–30 min).
