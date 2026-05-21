#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

load_env_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return
  fi
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

load_env_file "$ROOT_DIR/.env"
load_env_file "$ROOT_DIR/.env.deploy"

HOST="${RYTHM_DEPLOY_HOST:-frity.vds}"
SSH_USER="${RYTHM_DEPLOY_USER:-}"
PASSWORD="${RYTHM_DEPLOY_PASSWORD:-}"
APP_DIR="${RYTHM_DEPLOY_DIR:-/var/www/rythm.frylo.org}"
BRANCH="${RYTHM_DEPLOY_BRANCH:-}"
REMOTE="${HOST}"

if [ -n "$SSH_USER" ]; then
  REMOTE="$SSH_USER@$HOST"
fi

SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
)

ssh_cmd() {
  if [ -n "$PASSWORD" ]; then
    if ! command -v sshpass >/dev/null 2>&1; then
      echo "RYTHM_DEPLOY_PASSWORD is set, but sshpass is not installed locally." >&2
      echo "Install sshpass or use SSH keys instead." >&2
      exit 1
    fi
    SSHPASS="$PASSWORD" sshpass -e ssh "${SSH_OPTS[@]}" "$REMOTE" "$@"
  else
    ssh "${SSH_OPTS[@]}" "$REMOTE" "$@"
  fi
}

remote_script='
set -euo pipefail

cd "$APP_DIR"

if [ ! -d .git ]; then
  echo "$APP_DIR is not a git checkout. Clone the repo there once, then rerun deploy." >&2
  exit 1
fi

if [ -n "${BRANCH:-}" ]; then
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  git pull --ff-only
fi

if docker compose version >/dev/null 2>&1; then
  docker compose up -d --build --remove-orphans
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose up -d --build --remove-orphans
else
  echo "Docker Compose is required on the server." >&2
  exit 1
fi

docker image prune -f >/dev/null
'

echo "Deploying $REMOTE:$APP_DIR"
ssh_cmd "APP_DIR='$APP_DIR' BRANCH='$BRANCH' bash -s" <<<"$remote_script"
echo "Deploy complete."
