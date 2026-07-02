#!/usr/bin/env bash
# Deploy the PopStrip production build to DreamHost over rsync/SSH.
#
# Usage:
#   DH_HOST=user@popstrip.app DH_PATH=~/popstrip.app bash scripts/deploy.sh
#
# DH_HOST  SSH login (DreamHost SFTP user @ host)
# DH_PATH  target web directory for the domain

set -euo pipefail

: "${DH_HOST:?set DH_HOST=user@host}"
: "${DH_PATH:?set DH_PATH=~/popstrip.app}"

echo "› Building…"
npm run build

echo "› Deploying dist/ → ${DH_HOST}:${DH_PATH}/"
rsync -avz --delete dist/ "${DH_HOST}:${DH_PATH}/"

echo "✓ Deployed. Check https://popstrip.app"
