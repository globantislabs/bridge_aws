#!/usr/bin/env bash
# ============================================================================
# Bridge — one-shot deploy script for AWS Ubuntu (22.04 / 24.04 LTS)
# ----------------------------------------------------------------------------
# Usage (from your local machine, after rsync-ing the repo to the server):
#
#   sudo bash deploy/setup.sh <DOMAIN> <EMAIL_FOR_LETSENCRYPT>
#
# Example:
#   sudo bash deploy/setup.sh bridge.mycompany.com you@mycompany.com
#
# What it does:
#   1. Installs system deps (Python 3.11+, Node 20, Nginx, certbot)
#   2. Creates a `bridge` service user
#   3. Sets up /opt/bridge as the app root, copies /app -> /opt/bridge
#   4. Creates a Python venv from system python3 (via uv) and installs backend requirements
#   5. Writes the backend .env (Supabase + LiveKit + OpenAI + Stripe + admin)
#   6. Applies the Supabase Postgres schema (best-effort, via asyncpg if
#      SUPABASE_DB_URL is set, otherwise prints the SQL to run by hand)
#   7. Builds the React frontend for production (yarn build)
#   8. Installs a systemd unit for the backend (NO mongod dependency)
#   9. Configures nginx to serve the static build + reverse-proxy /api
#  10. Obtains a Let's Encrypt certificate and enables HTTPS
#  11. Starts the backend and runs a /api/health smoke test
#
# Database: Supabase (Postgres). MongoDB is NOT used. If you are upgrading an
# older install that had MongoDB, the mongod service/unit are left in place but
# are no longer required or started by Bridge.
#
# Idempotent — safe to re-run.  Requires an A record already pointing at the
# EC2 public IP (or an Elastic IP).  Open TCP 22, 80 and 443 in the security
# group.
# ============================================================================

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: sudo bash deploy/setup.sh <domain> <email>"
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Please run with sudo / as root"; exit 1
fi

APP_USER=bridge
APP_ROOT=/opt/bridge
REPO_SRC="${REPO_SRC:-$(pwd)}"
BACKEND_PORT=8001

echo "==> Bridge deployment for $DOMAIN"
echo "==> Repo source: $REPO_SRC"
echo "==> Database: Supabase (Postgres) — MongoDB is not used"

# ---------- 1. System packages ---------------------------------------------
echo "==> Installing system packages"
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg lsb-release build-essential git \
  python3 python3-dev \
  nginx certbot python3-certbot-nginx \
  ufw rsync
# python3-dev provides Python.h — a safety net in case any package in
# requirements.txt needs to fall back to a source build. uv itself does not
# need it. NOTE: we do NOT try to install python3.12 via the deadsnakes PPA
# here — on some distros (e.g. Ubuntu 'resolute') the PPA has no packages
# and `apt install python3.12` fails, which would abort setup.sh under
# `set -euo pipefail`. Instead, if no wheel-compatible system Python
# (3.10/3.11/3.12) is found, the venv block below falls back to uv-managed
# Python 3.12 (`uv python install 3.12`) — asyncpg 0.30.0 has cp312 wheels,
# and uv's 3.12 managed build is stable (the _sysconfigdata_ bug was
# 3.11-specific).

# Node 20 (for building the frontend + yarn) -------------------------------
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v20* ]]; then
  echo "==> Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if ! command -v yarn >/dev/null 2>&1; then
  npm install -g yarn
fi

# uv (fast Python package manager — creates and manages the backend venv) -----
# Installed system-wide so the `bridge` service user can use it too.
if ! command -v uv >/dev/null 2>&1; then
  echo "==> Installing uv"
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh
fi

# NOTE: MongoDB is intentionally NOT installed. Bridge stores all data in
# Supabase (Postgres). The old MongoDB install block was removed because:
#   (a) the backend imports `supa.py` which hard-requires SUPABASE_URL /
#       SUPABASE_SECRET_KEY, and never reads MONGO_URL at runtime;
#   (b) mongodb-org 7.0 has no official packages for Ubuntu 24.04 (noble),
#       so the old block broke deployment on 24.04 LTS.

# ---------- 2. Service user ------------------------------------------------
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_ROOT" --shell /usr/sbin/nologin "$APP_USER"
fi

# ---------- 3. Copy the app -----------------------------------------------
echo "==> Copying application into $APP_ROOT"
mkdir -p "$APP_ROOT"
rsync -a --delete \
  --exclude 'node_modules' --exclude '.git' --exclude '_legacy' \
  --exclude 'frontend/build' --exclude '__pycache__' --exclude '.venv' \
  "$REPO_SRC/" "$APP_ROOT/"
chown -R "$APP_USER":"$APP_USER" "$APP_ROOT"

# ---------- 4. Backend venv + deps (via uv) -------------------------------
echo "==> Setting up backend venv with uv"
# Python selection strategy (prefers the NEWEST available Python, since
# asyncpg==0.31.0 now ships wheels for cp39-cp314 inclusive):
#   1. System python3.14 / 3.13 / 3.12 / 3.11 / 3.10 — created with
#      --python-preference only-system so uv doesn't substitute its managed
#      build (avoids the _sysconfigdata_ bug seen on uv's 3.11 build).
#   2. uv-managed python3.14 (uv python install 3.14) — used when the host
#      has NO suitable system Python (e.g. Ubuntu 'resolute' / custom AMIs
#      where the default python3 is too old or the distro ships an odd build).
#      uv's 3.14 managed build is stable on hosts where its 3.14 download
#      works (the _sysconfigdata_ bug was 3.11-specific).
# asyncpg 0.31.0 explicitly adds Python 3.14 support (cp314 wheels), so the
# original "Python.h: No such file or directory" source-build failure on 3.14
# is gone. requirements.txt pins asyncpg==0.31.0 for this reason.
#
# The venv logic is written to a temp script (heredoc with a SINGLE-QUOTED
# delimiter so nothing inside is expanded by the outer shell — no nested
# \" escaping hell). The script receives APP_ROOT as $1.
cat > /tmp/bridge_venv_setup.sh <<'VENVSCRIPT'
#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="$1"
cd "$APP_ROOT/backend"

UV=/usr/local/bin/uv
# Pin uv's cache to a bridge-owned path so it never touches /var/cache/uv
# (root-owned — would cause permission errors for the bridge service user).
export UV_CACHE_DIR="$APP_ROOT/.cache/uv"
mkdir -p "$UV_CACHE_DIR"

# Clear any stale/broken venv from a previous failed run.
rm -rf .venv

# Pick the NEWEST SYSTEM Python that asyncpg 0.31.0 has a wheel for
# (cp39-cp314). Order: 3.14 > 3.13 > 3.12 > 3.11 > 3.10.
PY_BIN=""
for v in 3.14 3.13 3.12 3.11 3.10; do
  if command -v "python$v" >/dev/null 2>&1; then
    PY_BIN="$(command -v "python$v")"
    break
  fi
done

if [[ -n "$PY_BIN" ]]; then
  echo "==> Using SYSTEM Python: $PY_BIN ($("$PY_BIN" --version 2>&1))"
  # --python-preference only-system: NEVER substitute uv-managed python-build-standalone
  # (broken _sysconfigdata_ on some Ubuntu/glibc combos → venv creation fails).
  "$UV" venv --python "$PY_BIN" --python-preference only-system .venv
else
  # No suitable system Python (e.g. Ubuntu 'resolute' / custom AMI). Fall back
  # to uv-managed Python 3.14. asyncpg 0.31.0 ships cp314 wheels, and uv's
  # 3.14 managed build is stable (the _sysconfigdata_ bug was 3.11-specific).
  echo "==> No suitable system Python — using uv-managed Python 3.14"
  "$UV" python install 3.14
  "$UV" venv --python 3.14 .venv
fi

# Single resolve: requirements.txt already includes emergentintegrations
# and the litellm direct-URL wheel, so everything resolves together
# (uv rejects transitive URL deps — litellm must be a direct req here).
"$UV" pip install --python .venv/bin/python -r requirements.txt \
  --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
VENVSCRIPT
chmod +x /tmp/bridge_venv_setup.sh
# set -euo pipefail (top of file) aborts setup.sh if this fails.
sudo -u "$APP_USER" /tmp/bridge_venv_setup.sh "$APP_ROOT"
rm -f /tmp/bridge_venv_setup.sh

# ---------- 5. Backend .env ------------------------------------------------
# Required by the Python backend at IMPORT time (supa.py raises KeyError if
# these are missing → uvicorn crash loop).  We write a fresh template on
# first run, and migrate legacy Mongo-only .env files by appending the
# Supabase block.
ENV_FILE="$APP_ROOT/backend/.env"

write_full_env_template() {
  # $1 = domain
  cat <<EOF
# ---- Supabase (REQUIRED — backend will not start without these) ----
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVICE_ROLE_KEY
# Direct Postgres connection string (pooler). Optional but recommended:
# lets the deploy script create tables for you. Find it in Supabase Dashboard
# > Project Settings > Database > Connection string > Transaction pooler.
SUPABASE_DB_URL=

# ---- LiveKit (REQUIRED) ----
# NOTE: the var name is LIVEKIT_API_SECRET (no _KEY suffix) — matches server.py.
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=REPLACE_ME
LIVEKIT_API_SECRET=REPLACE_ME

# ---- AI providers ----
OPENAI_API_KEY=sk-proj-REPLACE_ME
STRIPE_API_KEY=sk_live_REPLACE_ME

# ---- Auth / admin ----
JWT_SECRET=$(openssl rand -hex 32)
FIXED_ADMIN_EMAIL=admin@$1
FIXED_ADMIN_PASSWORD=$(openssl rand -base64 24)

# ---- Legacy (ignored at runtime, kept for backward compat) ----
# MONGO_URL and DB_NAME are no longer used; all data lives in Supabase.
MONGO_URL=
DB_NAME=
EOF
}

append_supabase_block() {
  cat >> "$ENV_FILE" <<EOF

# ---- Supabase (REQUIRED — added by setup.sh migration) ----
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_DB_URL=
EOF
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Writing template $ENV_FILE — edit real values before restart!"
  write_full_env_template "$DOMAIN" > "$ENV_FILE"
else
  # Migrate a legacy Mongo-only .env by appending the Supabase block if missing.
  if ! grep -q '^SUPABASE_URL=' "$ENV_FILE"; then
    echo "==> Existing .env is missing Supabase vars — appending them"
    append_supabase_block
  fi
  # Ensure JWT_SECRET exists.
  if ! grep -q '^JWT_SECRET=' "$ENV_FILE"; then
    echo "JWT_SECRET=$(openssl rand -hex 32)" >> "$ENV_FILE"
  fi
fi
chown "$APP_USER":"$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# ---------- 6. Apply Supabase schema (best effort) ------------------------
# `init_supabase.py` uses asyncpg against SUPABASE_DB_URL. If that var is
# empty/not set, the script just prints the SQL for the user to paste into
# the Supabase SQL editor. Either way the backend can start afterwards.
echo "==> Applying Supabase schema (best-effort)"
sudo -u "$APP_USER" bash -c "
  cd $APP_ROOT/backend
  .venv/bin/python scripts/init_supabase.py || true
" || true

# ---------- 7. Frontend production build ----------------------------------
echo "==> Writing frontend .env"
cat > "$APP_ROOT/frontend/.env" <<EOF
REACT_APP_BACKEND_URL=https://$DOMAIN
WDS_SOCKET_PORT=443
EOF
chown "$APP_USER":"$APP_USER" "$APP_ROOT/frontend/.env"

echo "==> Building frontend (this takes a couple of minutes)"
sudo -u "$APP_USER" bash -c "
  cd $APP_ROOT/frontend
  yarn install --frozen-lockfile
  yarn build
"

# ---------- 8. systemd unit for the backend --------------------------------
echo "==> Installing systemd unit"
cat > /etc/systemd/system/bridge-backend.service <<EOF
[Unit]
Description=Bridge — FastAPI backend (Supabase)
After=network.target
# No mongod dependency: data lives in Supabase (Postgres).

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_ROOT/backend
EnvironmentFile=$APP_ROOT/backend/.env
ExecStart=$APP_ROOT/backend/.venv/bin/uvicorn server:app \\
  --host 127.0.0.1 --port $BACKEND_PORT --workers 2 --proxy-headers \\
  --forwarded-allow-ips '*'
Restart=always
RestartSec=3
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable bridge-backend

# ---------- 9. Pre-flight: refuse to start with placeholder secrets -------
# This turns a silent uvicorn crash-loop into a clear, actionable error.
if grep -qE '^(SUPABASE_URL|SUPABASE_SECRET_KEY|LIVEKIT_URL|LIVEKIT_API_KEY|LIVEKIT_API_SECRET)=.*(YOUR_|REPLACE_ME|YOUR_PROJECT_REF)' "$ENV_FILE"; then
  echo ""
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "  ⚠️  Backend NOT started: placeholder secrets detected in $ENV_FILE"
  echo "  Fill in real values for:"
  echo "      SUPABASE_URL, SUPABASE_SECRET_KEY,"
  echo "      LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET"
  echo "  then re-run:  sudo bash $APP_ROOT/deploy/setup.sh $DOMAIN $EMAIL"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  # Still configure nginx + TLS so the static site is reachable, but leave
  # the backend stopped so the operator notices.
  systemctl stop bridge-backend 2>/dev/null || true
  BACKEND_STARTED=0
else
  systemctl restart bridge-backend
  BACKEND_STARTED=1
fi

# ---------- 10. Nginx ------------------------------------------------------
echo "==> Configuring nginx"
cat > /etc/nginx/sites-available/bridge <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    # Certbot will inject HTTPS block; keep this for the ACME challenge.
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    # SSL certs added later by certbot
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(self), display-capture=(self)";

    client_max_body_size 25M;

    # Static React build
    root $APP_ROOT/frontend/build;
    index index.html;

    # Long-cache the hashed JS/CSS chunks
    location /static/ {
        expires 1y;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    # API — reverse proxy to FastAPI
    location /api/ {
        proxy_pass          http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version  1.1;
        proxy_set_header    Host \$host;
        proxy_set_header    X-Real-IP \$remote_addr;
        proxy_set_header    X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto \$scheme;
        proxy_set_header    Upgrade \$http_upgrade;
        proxy_set_header    Connection "upgrade";
        proxy_read_timeout  600s;
        proxy_send_timeout  600s;
    }

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/bridge /etc/nginx/sites-enabled/bridge
rm -f /etc/nginx/sites-enabled/default

# ---------- 11. Firewall ---------------------------------------------------
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true

# ---------- 12. TLS via Let's Encrypt --------------------------------------
# On first run the SSL block above references certs that don't yet exist.
# Use a temporary HTTP-only vhost, obtain the cert, then switch nginx back on.
if [[ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]]; then
  echo "==> Requesting Let's Encrypt certificate for $DOMAIN"
  cat > /etc/nginx/sites-available/bridge <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    root /var/www/html;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 200 'bootstrapping'; add_header Content-Type text/plain; }
}
EOF
  nginx -t && systemctl reload nginx
  certbot certonly --nginx --non-interactive --agree-tos -m "$EMAIL" -d "$DOMAIN"
fi

# Restore the full vhost (with API proxy + HTTPS)
cat > /etc/nginx/sites-available/bridge <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Permissions-Policy "camera=(self), microphone=(self), display-capture=(self)";
    client_max_body_size 25M;

    root $APP_ROOT/frontend/build;
    index index.html;

    location /static/ {
        expires 1y;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

nginx -t && systemctl reload nginx

# Auto-renewal cron is already provided by the certbot package (systemd timer).

# ---------- 13. Health check ----------------------------------------------
if [[ "$BACKEND_STARTED" == "1" ]]; then
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
    echo "    ✅ backend healthy"
  else
    echo "    ❌ backend did not become healthy — last 40 log lines:"
    journalctl -u bridge-backend -n 40 --no-pager || true
    echo ""
    echo "    Common causes:"
    echo "      • SUPABASE_URL / SUPABASE_SECRET_KEY wrong or still placeholders"
    echo "      • Supabase schema not applied (paste backend/schema.sql into the SQL editor)"
    echo "      • LIVEKIT_* vars missing"
    echo "    Inspect:  sudo journalctl -u bridge-backend -f"
  fi
fi

echo ""
echo "===================================================================="
echo "  ✅  Bridge deployed for https://$DOMAIN"
if [[ "$BACKEND_STARTED" == "1" ]]; then
  echo "  ✅  Backend is running (systemd: bridge-backend)"
else
  echo "  ⚠️  Backend is STOPPED — fix secrets in $ENV_FILE and re-run setup.sh"
fi
echo "  📝  Edit real API keys:  $APP_ROOT/backend/.env"
echo "      Required: SUPABASE_URL, SUPABASE_SECRET_KEY,"
echo "               LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET"
echo "      Then:  sudo systemctl restart bridge-backend"
echo "  🗄️  Supabase schema:  paste backend/schema.sql into the Supabase"
echo "      SQL editor once, OR set SUPABASE_DB_URL and re-run setup.sh"
echo "  🔑  Admin login:  see FIXED_ADMIN_EMAIL / FIXED_ADMIN_PASSWORD in .env"
echo "  📜  Backend logs: sudo journalctl -u bridge-backend -f"
echo "  🔁  Redeploy:    sudo bash $APP_ROOT/deploy/redeploy.sh"
echo "===================================================================="
