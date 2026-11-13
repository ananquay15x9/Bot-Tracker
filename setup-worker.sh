#!/usr/bin/env bash
# setup-worker.sh - installs the iSite crawler worker on a Raspberry Pi. Run it from inside this folder:
#     bash setup-worker.sh
# With a USB drive already mounted (see README) keep the worker's temporary files and saved results on it:
#     bash setup-worker.sh --usb /mnt/events
# It asks for your password (sudo) for the system parts. Safe to run again.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
SKIP_SYSTEM="${SETUP_SKIP_SYSTEM:-0}"   # used only for testing the file-generation part off the Pi
USB=""
while [ $# -gt 0 ]; do
  case "$1" in
    --usb) USB="${2:-}"; shift 2 ;;
    *) echo "Unknown option: $1   (only --usb /path is supported)"; exit 1 ;;
  esac
done

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

if [ "$SKIP_SYSTEM" != "1" ]; then
  say "1/6  Checking Node.js (needs version 22 or newer)"
  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
    echo "Node 22+ is not installed. Install it first (the same way you did on the hub Pi), then run this again."; exit 1
  fi
  node -v

  say "2/6  Installing the virtual screen (xvfb)"
  sudo apt-get update -y && sudo apt-get install -y xvfb openssl

  say "3/6  Checking swap (a safety net for a 2GB Pi)"
  swap_mb=$(free -m | awk '/^Swap:/ {print $2}')
  if [ "${swap_mb:-0}" -lt 1024 ]; then
    echo "Swap is only ${swap_mb:-0} MB. Strongly recommended on a 2GB Pi - to raise it to 2 GB:"
    echo "    sudo dphys-swapfile swapoff && sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile && sudo dphys-swapfile setup && sudo dphys-swapfile swapon"
  else echo "Swap is ${swap_mb} MB - good."; fi
fi

if [ -n "$USB" ]; then
  say "USB drive: checking ${USB}"
  USB="${USB%/}"
  if [ "$SKIP_SYSTEM" != "1" ] && ! mountpoint -q "$USB"; then
    echo "${USB} is not a mounted drive. Mount it first (see the README), so nothing is ever written to the SD card by mistake."; exit 1
  fi
  if [ "$SKIP_SYSTEM" != "1" ]; then sudo mkdir -p "$USB/worker-data" "$USB/tmp"; sudo chown -R "$(id -un):$(id -gn)" "$USB/worker-data" "$USB/tmp"; else mkdir -p "$USB/worker-data" "$USB/tmp"; fi
  echo "Worker data -> ${USB}/worker-data   Temporary browser files -> ${USB}/tmp"
fi

say "4/6  Installing the worker's packages"
npm install --omit=dev --no-audit --no-fund
if [ "$SKIP_SYSTEM" != "1" ]; then
  say "     Installing the browser the crawlers use (this takes a few minutes)"
  sudo npx playwright install --with-deps chromium
  # the browser must be readable by this user too
  npx playwright install chromium
fi

say "5/6  Writing the settings (.env)"
if [ -f .env ]; then
  echo ".env already exists - leaving it alone."
else
  cp .env.example .env
  TOKEN="$(openssl rand -hex 24)"
  sed -i "s/^WORKER_TOKEN=.*/WORKER_TOKEN=${TOKEN}/" .env
  if command -v tailscale >/dev/null 2>&1 && TSIP="$(tailscale ip -4 2>/dev/null | head -n1)" && [ -n "${TSIP:-}" ]; then
    sed -i "s/^WORKER_HOST=.*/WORKER_HOST=${TSIP}/" .env
    echo "Listening only on the Tailscale address ${TSIP}."
  else
    echo "Tailscale not found - it will listen on every network address. Set WORKER_HOST in .env once Tailscale is up."
  fi
fi

if [ -n "$USB" ]; then
  grep -q '^WORKER_DATA_DIR=' .env && sed -i "s|^WORKER_DATA_DIR=.*|WORKER_DATA_DIR=${USB}/worker-data|" .env || echo "WORKER_DATA_DIR=${USB}/worker-data" >> .env
fi

say "6/6  Installing the service (starts on boot, restarts if it stops)"
UNIT="isite-crawler-worker.service"
USBLINES=""
if [ -n "$USB" ]; then USBLINES="RequiresMountsFor=${USB}\nEnvironment=TMPDIR=${USB}/tmp"; fi
sed -e "s|__USER__|$(id -un)|" -e "s|__DIR__|${DIR}|" -e "s|__NODE__|$(command -v node)|" -e "s|__USB__|${USBLINES}|" "$UNIT" > "${UNIT}.generated"
if [ "$SKIP_SYSTEM" != "1" ]; then
  sudo cp "${UNIT}.generated" "/etc/systemd/system/${UNIT}"
  sudo systemctl daemon-reload
  sudo systemctl enable --now isite-crawler-worker
  sleep 3
  systemctl --no-pager --lines=5 status isite-crawler-worker || true
fi

HOST="$(grep '^WORKER_HOST=' .env | cut -d= -f2)"; PORT="$(grep '^WORKER_PORT=' .env | cut -d= -f2)"; TOK="$(grep '^WORKER_TOKEN=' .env | cut -d= -f2)"
SHOWN="$HOST"
if [ "$HOST" = "0.0.0.0" ]; then SHOWN="<this Pi's Tailscale address, from: tailscale ip -4>"; fi
say "Done. Put these two lines in the HUB's .env file, then restart the hub:"
echo "    EVENTS_WORKER_URL=http://${SHOWN}:${PORT}"
echo "    EVENTS_WORKER_TOKEN=${TOK}"
echo
echo "Check it is alive from this Pi:   curl -s -H \"x-worker-token: ${TOK}\" http://${HOST/0.0.0.0/127.0.0.1}:${PORT}/health"
