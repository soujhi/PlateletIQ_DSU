#!/usr/bin/env bash
# ============================================================================
#  PlateletIQ launcher (macOS / Linux)
#
#  Sets up whatever is missing, starts the backend, waits until it actually
#  answers, and only then starts the frontend. Order matters: the UI reads the
#  API's configuration when it loads.
#
#  Usage:  ./start.sh          (Ctrl+C stops both)
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")"

API_URL="http://127.0.0.1:8000/api/v1/health"
UI_URL="http://127.0.0.1:5173/"

say()  { printf '  %s\n' "$*"; }
die()  { printf '\nERROR: %s\n\n' "$*" >&2; exit 1; }

printf '\n  PlateletIQ\n  ==========\n\n'

command -v python3 >/dev/null 2>&1 || die "python3 not found. Install Python 3.10 or newer."
command -v npm     >/dev/null 2>&1 || die "npm not found. Install Node.js from https://nodejs.org/"

VENV_PY="backend/.venv/bin/python"

if [ ! -x "$VENV_PY" ]; then
  say "[1/5] Creating the Python virtual environment..."
  python3 -m venv backend/.venv
else
  say "[1/5] Python virtual environment already present."
fi

say "[2/5] Installing backend dependencies..."
"$VENV_PY" -m pip install --quiet --disable-pip-version-check -r backend/requirements.txt

say "[3/5] Checking backend configuration..."
"$VENV_PY" scripts/bootstrap_env.py

if [ ! -d frontend/node_modules ]; then
  say "[4/5] Installing frontend dependencies. This takes a minute the first time..."
  (cd frontend && npm install --no-audit --no-fund)
else
  say "[4/5] Frontend dependencies already installed."
fi

# Make sure both children die with this script, however it exits.
BACKEND_PID=""
FRONTEND_PID=""
cleanup() {
  trap - EXIT INT TERM
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null || true
  printf '\n  Stopped.\n\n'
}
trap cleanup EXIT INT TERM

wait_for() {
  local url="$1" label="$2" attempts=0
  while ! curl -fsS -o /dev/null --max-time 2 "$url" 2>/dev/null; do
    attempts=$((attempts + 1))
    [ "$attempts" -ge 90 ] && die "$label did not answer within 90 seconds. See the log above."
    sleep 1
  done
}

say "[5/5] Starting the backend..."
( cd backend && exec ../backend/.venv/bin/python -m uvicorn main:app --port 8000 ) &
BACKEND_PID=$!

say "      Waiting for the API to come up..."
wait_for "$API_URL" "The backend"
say "      The API is up."

say "      Starting the frontend..."
( cd frontend && exec npm run dev ) &
FRONTEND_PID=$!

say "      Waiting for the UI to come up..."
wait_for "$UI_URL" "The frontend"

cat <<BANNER

  Both services are running.

    UI       http://localhost:5173
    API      http://127.0.0.1:8000/api/v1/health
    API docs http://127.0.0.1:8000/docs

  Two hospitals on one machine: sign in here with one email and pick a
  facility, then open a private window at the same address, sign in with a
  different email, and pick another facility.

  Press Ctrl+C to stop both.

BANNER

wait
