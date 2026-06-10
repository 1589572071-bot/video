#!/usr/bin/env bash
set -euo pipefail

cd /home/devbox/project

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm ci
fi

if [ ! -f .next/BUILD_ID ]; then
  echo "Building Next.js app..."
  npm run build
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3000}"

echo "Starting MetaCut on ${HOST}:${PORT}"
exec npm run start -- -H "${HOST}" -p "${PORT}"
