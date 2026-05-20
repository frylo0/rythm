#!/usr/bin/env bash
set -euo pipefail

HOST="${RYTHM_DEPLOY_HOST:frity.vds}"
APP_DIR="${RYTHM_DEPLOY_DIR:-/var/www/rythm.frylo.org}"

ssh "$HOST" "cd '$APP_DIR' && git pull --ff-only && docker compose up -d --build && docker image prune -f"
