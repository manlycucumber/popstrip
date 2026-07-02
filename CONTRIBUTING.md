# Contributing to PopStrip

**Workflow:** Standard

PopStrip is a small, versioned project run in the open. This file is the shared source of truth for how contributors and tooling work here.

## Branches & pull requests

- `main` is the only permanent branch and always stays in a usable state.
- Branch `feature/<short-slug>` off `main` for anything non-trivial, then open a PR back into `main`. Genuinely trivial changes (a typo) can go straight to `main`.
- **Squash-and-merge** each PR so it lands as one clean, revertable commit; delete the branch after.

## Issues & claiming work

- Real work gets a **GitHub Issue** — clear title, a sentence of problem, and acceptance criteria.
- Link the issue from its PR with `Closes #N` so merging closes it.
- **Claim by assigning yourself.** Labels start at `bug` / `enhancement`, plus `priority: high|medium|low` if a queue builds up.

## Roadmap & versions

- **Milestones = versions.** One milestone per target version; see [ROADMAP.md](ROADMAP.md).
- **SemVer, by hand:** `vMAJOR.MINOR.PATCH`. `v1.0.0` = photos feature-complete. Bump the version in `package.json` when you release.

## Commits

Clear, **imperative** titles that say what changed and why. Conventional-Commit style (`feat:`, `fix:`, `docs:` …) is **recommended, not enforced** — it makes release notes almost automatic.

## Commands

```bash
npm run dev      # dev server
npm run build    # production build → dist/
npm run check    # type-check
npm run preview  # preview the build
```

## Releases

Draft a GitHub Release → tag `vX.Y.Z` on `main` (title = the version) → **Generate release notes** → rewrite them into the project's release-notes template (🚀 banner, ✨ What's New, 📦 Installing, then sorted changes). Publish, and bump `package.json`.

## Deploy

The static build (`dist/`) deploys to DreamHost shared hosting over rsync/SFTP; HTTPS is DreamHost's automatic Let's Encrypt. Steps in [DEPLOY.md](DEPLOY.md).
