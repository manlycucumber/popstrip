#!/usr/bin/env bash
# Deploy the PopStrip production build (dist/) to a static web host over SSH.
#
# Host-agnostic: config comes from env vars, or a git-ignored scripts/deploy.env:
#   DEPLOY_HOST=user@server                        # SSH target
#   DEPLOY_PATH=~/web/popstrip.app/public_html     # the web docroot on the server
#
# Legacy DreamHost names DH_HOST / DH_PATH are still accepted as aliases, so an
# old scripts/deploy.env keeps working.
#
# Requires an SSH key already authorized for DEPLOY_HOST (passwordless).
# Uses rsync when available, otherwise falls back to scp (Git Bash has no rsync).

set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
[ -f scripts/deploy.env ] && . scripts/deploy.env

# Accept the old DreamHost-specific names as aliases.
DEPLOY_HOST="${DEPLOY_HOST:-${DH_HOST:-}}"
DEPLOY_PATH="${DEPLOY_PATH:-${DH_PATH:-}}"

: "${DEPLOY_HOST:?set DEPLOY_HOST (e.g. in scripts/deploy.env: DEPLOY_HOST=user@host)}"
: "${DEPLOY_PATH:?set DEPLOY_PATH (e.g. in scripts/deploy.env: DEPLOY_PATH=~/web/popstrip.app/public_html)}"

SSH_OPTS="-o BatchMode=yes"

echo "› Building…"
npm run build

if command -v rsync >/dev/null 2>&1; then
  echo "› rsync → ${DEPLOY_HOST}:${DEPLOY_PATH}/"
  rsync -az --delete -e "ssh ${SSH_OPTS}" dist/ "${DEPLOY_HOST}:${DEPLOY_PATH}/"
else
  echo "› scp → ${DEPLOY_HOST}:${DEPLOY_PATH}/  (rsync not installed)"
  # Clear old hashed bundles so they don't pile up.
  ssh ${SSH_OPTS} "${DEPLOY_HOST}" "rm -rf ${DEPLOY_PATH}/assets"
  ( cd dist && scp -r ${SSH_OPTS} -q . "${DEPLOY_HOST}:${DEPLOY_PATH}/" )
fi

echo "✓ Deployed → https://popstrip.app"
