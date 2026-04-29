#!/usr/bin/env bash
# Double-clickable launcher for macOS (.command extension makes Finder run it).
# Linux users can run this with `./SWH-Framework.command` from a terminal.

set -e
cd "$(dirname "$0")"

echo
echo "  ======================================================="
echo "   SWH Instagram Framework Builder - one-click launcher"
echo "  ======================================================="
echo

# ----- Node check ----------------------------------------------------------

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed."
  echo "        Install Node 20+ from https://nodejs.org/ and try again."
  read -n 1 -s -r -p "Press any key to exit..."
  exit 1
fi

# ----- First-run setup -----------------------------------------------------

if [ ! -d "server/node_modules" ]; then
  echo "[setup] Installing server dependencies..."
  (cd server && npm install)
fi

if [ ! -d "client/node_modules" ]; then
  echo "[setup] Installing client dependencies..."
  (cd client && npm install)
fi

if [ ! -f "client/dist/index.html" ]; then
  echo "[build] Building the React UI..."
  (cd client && npm run build)
fi

# ----- API key check -------------------------------------------------------

if [ ! -f "server/.env" ]; then
  echo "[setup] server/.env not found - creating from .env.example."
  cp server/.env.example server/.env
  echo
  echo "  IMPORTANT: open  server/.env  and paste your real API keys:"
  echo "    ANTHROPIC_API_KEY=sk-ant-...      (required)"
  echo "    GROQ_API_KEY=gsk_...              (optional, for transcription)"
  echo
  echo "  Then run this launcher again."
  echo
  read -n 1 -s -r -p "Press any key to exit..."
  exit 0
fi

# ----- Launch --------------------------------------------------------------

echo "[run] Starting server and opening the app in your browser..."
echo "      Press Ctrl+C to stop the app."
echo

node start.js
