#!/usr/bin/env bash
# Bridge — redeploy script.
# Run this on the server AFTER you rsync updated code (or `git pull`)
# to /opt/bridge.
#
#   sudo bash /opt/bridge/deploy/redeploy.sh

set -euo pipefail
APP_USER=bridge
APP_ROOT=/opt/bridge
BACKEND_PORT=8001

if [[ $EUID -ne 0 ]]; then echo "Run with sudo"; exit 1; fi
[[ -d "$APP_ROOT" ]] || { echo "$APP_ROOT missing — run setup.sh first"; exit 1; }

echo "==> Backend deps (uv)"
# Python selection strategy (prefers NEWEST Python — asyncpg 0.31.0 has
# cp39-cp314 wheels, so 3.14 is now fully supported):
#   1. System python3.14 / 3.13 / 3.12 / 3.11 / 3.10 — created with
#      --python-preference only-system so uv doesn't substitute its managed
#      build (avoids the _sysconfigdata_ bug seen on uv's 3.11 build).
#   2. uv-managed python3.14 (uv python install 3.14) — used when the host
#      has NO suitable system Python (e.g. Ubuntu 'resolute' / custom AMIs).
#      asyncpg 0.31.0 ships cp314 wheels; uv's 3.14 managed build is stable
#      (the _sysconfigdata_ bug was 3.11-specific).
cat > /tmp/bridge_redeploy_venv.sh <<'VENVSCRIPT'
#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="$1"
cd "$APP_ROOT/backend"
export UV_CACHE_DIR="$APP_ROOT/.cache/uv"
mkdir -p "$UV_CACHE_DIR"
UV=/usr/local/bin/uv

# Detect the venv's current Python version (empty if venv is broken/missing).
VENV_VER=""
if [[ -x .venv/bin/python ]]; then
  VENV_VER="$(.venv/bin/python -c 'import sys;print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "")"
fi

# Accept 3.10-3.14 (asyncpg 0.31.0 has wheels for all of these).
# Anything older, unknown, or empty → recreate the venv from scratch.
case "$VENV_VER" in
  3.14|3.13|3.12|3.11|3.10) : ;;  # acceptable, keep the venv
  *)
    echo "==> .venv missing or using Python ${VENV_VER:-<none>} (not 3.10-3.14) — recreating"
    rm -rf .venv

    # Strategy 1: newest available system python3.14 > 3.13 > ... > 3.10.
    PY_BIN=""
    for v in 3.14 3.13 3.12 3.11 3.10; do
      if command -v "python$v" >/dev/null 2>&1; then
        PY_BIN="$(command -v "python$v")"
        break
      fi
    done

    if [[ -n "$PY_BIN" ]]; then
      echo "==> Using SYSTEM Python: $PY_BIN ($("$PY_BIN" --version 2>&1))"
      "$UV" venv --python "$PY_BIN" --python-preference only-system .venv
    else
      # Strategy 2: no suitable system Python → use uv-managed 3.14.
      # asyncpg 0.31.0 ships cp314 wheels; uv's 3.14 build is stable.
      echo "==> No suitable system Python — using uv-managed Python 3.14"
      "$UV" python install 3.14
      "$UV" venv --python 3.14 .venv
    fi
    ;;
esac

"$UV" pip install --python .venv/bin/python -q -r requirements.txt \
  --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
VENVSCRIPT
chmod +x /tmp/bridge_redeploy_venv.sh
sudo -u "$APP_USER" /tmp/bridge_redeploy_venv.sh "$APP_ROOT"
rm -f /tmp/bridge_redeploy_venv.sh

echo "==> Frontend build"
sudo -u "$APP_USER" bash -c "
  cd $APP_ROOT/frontend
  yarn install --frozen-lockfile
  yarn build
"

echo "==> Restart"
systemctl restart bridge-backend
nginx -t && systemctl reload nginx

# ---- Health check --------------------------------------------------------
# Catches the most common redeploy failure: backend crashes on import because
# of a missing/typo'd env var in .env (e.g. SUPABASE_URL / SUPABASE_SECRET_KEY
# from supa.py, or LIVEKIT_* from server.py).
echo "==> Waiting for backend to answer /api/health"
healthy=0
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done
if [[ "$healthy" == "1" ]]; then
  echo "✅ redeploy complete — backend healthy"
else
  echo "❌ backend did not become healthy after redeploy — last 40 log lines:"
  journalctl -u bridge-backend -n 40 --no-pager || true
  echo ""
  echo "Common causes:"
  echo "  • SUPABASE_URL / SUPABASE_SECRET_KEY missing or wrong in $APP_ROOT/backend/.env"
  echo "  • Supabase schema not applied (paste backend/schema.sql into the Supabase SQL editor)"
  echo "  • LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing"
  echo "Inspect:  sudo journalctl -u bridge-backend -f"
  exit 1
fi
