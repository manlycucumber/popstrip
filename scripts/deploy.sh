#!/usr/bin/env bash
# Deploy the PopStrip production build to DreamHost over SSH.
#
# Config comes from env vars, or from a git-ignored scripts/deploy.env:
#   DH_HOST=user@server.dreamhost.com
#   DH_PATH=~/yourdomain
#
# Requires an SSH key already authorized for DH_HOST (passwordless).
# Uses rsync when available, otherwise falls back to scp (Git Bash has no rsync).

set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
[ -f scripts/deploy.env ] && . scripts/deploy.env

: "${DH_HOST:?set DH_HOST (e.g. in scripts/deploy.env: DH_HOST=user@host.dreamhost.com)}"
: "${DH_PATH:?set DH_PATH (e.g. in scripts/deploy.env: DH_PATH=~/popstrip.app)}"

SSH_OPTS="-o BatchMode=yes"

echo "› Building…"
npm run build

if command -v rsync >/dev/null 2>&1; then
  echo "› rsync → ${DH_HOST}:${DH_PATH}/"
  rsync -az --delete --exclude '.dh-diag' -e "ssh ${SSH_OPTS}" dist/ "${DH_HOST}:${DH_PATH}/"
else
  echo "› scp → ${DH_HOST}:${DH_PATH}/  (rsync not installed)"
  # Clear old hashed bundles so they don't pile up; keep DreamHost's .dh-diag symlink.
  ssh ${SSH_OPTS} "${DH_HOST}" "rm -rf ${DH_PATH}/assets"
  ( cd dist && scp -r ${SSH_OPTS} -q . "${DH_HOST}:${DH_PATH}/" )
fi

echo "✓ Deployed → https://popstrip.app"
