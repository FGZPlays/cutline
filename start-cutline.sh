#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$(realpath "$0")")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Cutline requires Node.js 20+ and npm. Install Node.js, then run this launcher again." >&2
  exit 1
fi
node -e "if (Number(process.versions.node.split('.')[0]) < 20) process.exit(1)" || {
  echo "Cutline requires Node.js 20 or newer; found $(node --version)." >&2
  exit 1
}

if [[ ! -x node_modules/.bin/vite ]]; then
  echo "Cutline dependencies are missing. Installing them with npm…"
  if ! npm install --no-audit --no-fund; then
    echo "Dependency installation failed. Check your internet connection and rerun ./start-cutline.sh." >&2
    exit 1
  fi
fi
if [[ ! -x node_modules/.bin/vite ]]; then
  echo "Vite did not install correctly. Try removing node_modules and running ./start-cutline.sh again." >&2
  exit 1
fi

echo "Starting Cutline. Vite will try to open your browser automatically."
echo "If the browser does not open, use the local URL printed below (normally http://localhost:5173)."
exec npm run dev
