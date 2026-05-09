#!/usr/bin/env bash
# chiqo.ai launcher — macOS / Linux double-click entry.
# Finder runs files with .command extensions; Linux users can run from a
# terminal with `./chiqo-ai.command`.

set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  chiqo.ai — Node.js is not installed."
  echo "  Install the LTS build from https://nodejs.org and try again."
  echo
  read -n 1 -s -r -p "  Press any key to exit..."
  echo
  exit 1
fi

exec node scripts/launch.js
