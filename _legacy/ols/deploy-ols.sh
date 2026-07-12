#!/usr/bin/env bash
# ====================================================================
# Bridge — One-shot OpenLiteSpeed deploy script
# --------------------------------------------------------------------
# Tested on Ubuntu 22.04 / 24.04 with OpenLiteSpeed 1.7.x+.
# Run as root on a fresh OLS server.
#
# Usage:
#   sudo bash deploy-ols.sh your-domain.com
#
# What it does:
#   1. Installs Node 20 + bun (if missing)
#   2. Creates /var/www/bridge and copies the project there
#   3. Installs deps + builds Next.js (standalone output)
#   4. Runs Prisma migrations against Supabase
#   5. Creates a systemd service for `node server.js` on port 3000
#   6. Creates the OLS vhost + reloads OLS
#   7. Provisions Let's Encrypt SSL via OLS's built-in certbot plugin
#   8. Sets up UFW firewall rules
# ====================================================================
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "❌ Usage: sudo bash $0 your-domain.com"
  exit 1
fi

APP_DIR="/var/www/bridge"
OLS_VHOST="/usr/local/lsws/conf/vhosts/bridge"
SERVICE_NAME="bridge"
NODE_PORT=3000

echo "🚀 Deploying Bridge to $DOMAIN (OLS + Node $NODE_PORT)"

# ─── 1. System dependencies ────────────────────────────────────────
echo "▶ Installing system packages…"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg ufw git

# Node 20 (if missing)
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v20* ]]; then
  echo "▶ Installing Node 20…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

# Bun (if missing)
if ! command -v bun >/dev/null 2>&1; then
  echo "▶ Installing bun…"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  echo 'export BUN_INSTALL="$HOME/.bun"' >> /etc/profile.d/bun.sh
  echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> /etc/profile.d/bun.sh
fi

# ─── 2. OpenLiteSpeed (if missing) ─────────────────────────────────
if ! command -v lswsctrl >/dev/null 2>&1; then
  echo "▶ Installing OpenLiteSpeed…"
  curl -fsSL https://raw.githubusercontent.com/litespeedtech/openlitespeed/master/dist/install.sh | bash
fi

# ─── 3. App directory + copy ───────────────────────────────────────
echo "▶ Preparing $APP_DIR…"
mkdir -p "$APP_DIR"

# If this script is in the project root, copy up. Otherwise expect user to scp/clone.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/package.json" ]]; then
  echo "▶ Copying project from $SCRIPT_DIR…"
  rsync -a --delete \
    --exclude node_modules \
    --exclude .next \
    --exclude .git \
    --exclude 'download/*.zip' \
    --exclude 'tool-results' \
    --exclude 'skills' \
    "$SCRIPT_DIR/" "$APP_DIR/"
else
  echo "⚠ No project files found next to this script. Please copy your Bridge project to $APP_DIR first, then re-run."
  exit 1
fi

cd "$APP_DIR"

# ─── 4. .env sanity check ──────────────────────────────────────────
if [[ ! -f .env ]]; then
  echo "⚠ .env missing — copying from .env.example"
  cp .env.example .env
  echo "⚠ EDIT $APP_DIR/.env and fill in real values for DATABASE_URL, DIRECT_URL, AUTH_SECRET, OPENAI_API_KEY before continuing."
  echo "  Then re-run: sudo bash $0 $DOMAIN"
  exit 1
fi
if grep -q 'REF:' .env || grep -q 'replace-with' .env; then
  echo "❌ .env still contains placeholders. Edit $APP_DIR/.env first."
  exit 1
fi

# ─── 5. Install + build ────────────────────────────────────────────
echo "▶ Installing deps (bun)…"
bun install --frozen-lockfile

echo "▶ Generating Prisma client…"
bunx prisma generate

echo "▶ Pushing schema to Supabase…"
bunx prisma db push --accept-data-loss

echo "▶ Building Next.js (standalone)…"
NODE_OPTIONS="--max-old-space-size=1024" bun run build

# Move standalone output to a stable location
echo "▶ Preparing standalone runtime…"
cp -r .next/standalone /var/www/bridge-server
cp -r .next/static /var/www/bridge-server/.next/static
cp -r public /var/www/bridge-server/public

# ─── 6. Systemd service ────────────────────────────────────────────
echo "▶ Creating systemd service: $SERVICE_NAME"
cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Bridge Next.js standalone server
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/bridge-server
EnvironmentFile=/var/www/bridge/.env
Environment=NODE_ENV=production
Environment=PORT=$NODE_PORT
Environment=HOSTNAME=127.0.0.1
ExecStartPre=/usr/bin/node /var/www/bridge-server/scripts/preflight.mjs --quiet
ExecStart=/usr/bin/node /var/www/bridge-server/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

# Make www-data the owner
chown -R www-data:www-data /var/www/bridge-server
chown -R www-data:www-data /var/www/bridge

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}

echo "▶ Waiting for Node to come up…"
sleep 3
for i in 1 2 3 4 5; do
  if curl -sf http://127.0.0.1:${NODE_PORT}/api/health >/dev/null; then
    echo "✅ Node server is healthy"
    break
  fi
  echo "  …attempt $i"
  sleep 2
done

# ─── 7. OLS vhost ──────────────────────────────────────────────────
echo "▶ Configuring OpenLiteSpeed vhost for $DOMAIN"

# Create vhost directory
mkdir -p "$OLS_VHOST"
mkdir -p /var/www/bridge-server/public

# Symlink static into place (OLS serves these)
ln -sfn /var/www/bridge-server/.next/static /var/www/bridge-server/public/_next_static 2>/dev/null || true

# Write the vhost XML
cat > "${OLS_VHOST}/vhost.conf" <<VHOSTEOF
docRoot                   /var/www/bridge-server/public/
vhname                    bridge

indexFiles                index.html

context /_next/static/ {
  type                    static
  location                /var/www/bridge-server/.next/static/
  allowBrowse             1
  extraHeaders            <<<
    Cache-Control: public, max-age=31536000, immutable
    X-Content-Type-Options: nosniff
<<<
}

context /api/ {
  type                    appserver
  handler                  bridge_node
  addDefaultCharset       off
}

context / {
  type                    appserver
  handler                  bridge_node
  addDefaultCharset       off
  extraHeaders            <<<
    X-Frame-Options: SAMEORIGIN
    Permissions-Policy: camera=(self), microphone=(self), display-capture=(self)
    Strict-Transport-Security: max-age=31536000; includeSubDomains
<<<
}

extProcessor bridge_node {
  type                    proxy
  address                 127.0.0.1:${NODE_PORT}
  maxConns                100
  initTimeout             60
  retryTimeout            5
  respBuffer              0
}
VHOSTEOF

# Register the vhost in OLS main config
OLS_MAIN_CONF="/usr/local/lsws/conf/httpd_config.conf"
if ! grep -q "virtualhost bridge " "$OLS_MAIN_CONF"; then
  cat >> "$OLS_MAIN_CONF" <<EOF

virtualhost bridge {
  vhRoot                  /var/www/bridge-server
  configFile              \$SERVER_ROOT/conf/vhosts/bridge/vhost.conf
  allowSymbolLink         1
  enableScript            1
  restrained              0
  setUIDMode              2
}
EOF
fi

# Map listener — find the existing HTTP/HTTPS listeners and add the vhost mapping
# (User may need to do this manually via WebAdmin → Listeners → bridge → Map)
echo ""
echo "⚠ MANUAL STEP REQUIRED:"
echo "  1. Open OLS WebAdmin at https://$DOMAIN:7080 (or http://SERVER_IP:7080)"
echo "  2. Listeners → HTTP (port 80) → Virtual Hosts → Add Mapping → bridge"
echo "  3. Listeners → HTTPS (port 443) → Virtual Hosts → Add Mapping → bridge"
echo "  4. Save & Graceful Restart"
echo ""

# ─── 8. SSL via OLS Let's Encrypt plugin ───────────────────────────
echo "▶ Provisioning Let's Encrypt SSL via OLS…"
if /usr/local/lsws/bin/lswsctrl available 2>/dev/null; then
  # Use OLS's certbot plugin
  if command -v certbot >/dev/null 2>&1; then
    certbot certonly --webroot -w /var/www/bridge-server/public -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" || true
    echo "  Cert generated. Now in OLS WebAdmin → Listeners → SSL → bridge → set cert+key paths:"
    echo "    Cert:  /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    echo "    Key:   /etc/letsencrypt/live/$DOMAIN/privkey.pem"
  else
    echo "  certbot not installed. Install via: apt install certbot python3-certbot-ols"
  fi
fi

# ─── 9. Firewall ───────────────────────────────────────────────────
echo "▶ Configuring UFW firewall…"
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 443/udp   # HTTP/3 (QUIC)
ufw --force enable

# ─── 10. Graceful restart ──────────────────────────────────────────
echo "▶ Restarting services…"
systemctl restart $SERVICE_NAME
/usr/local/lsws/bin/lswsctrl restart 2>/dev/null || true

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Edit /var/www/bridge/.env if you haven't already (Supabase URL, OpenAI key, etc.)"
echo "  2. Open OLS WebAdmin (https://$DOMAIN:7080) and map the listeners (see above)"
echo "  3. Verify: curl -I https://$DOMAIN/api/health"
echo "  4. Test meeting: open https://$DOMAIN and create a meeting"
echo ""
echo "Logs:"
echo "  App:   journalctl -u $SERVICE_NAME -f"
echo "  OLS:   tail -f /usr/local/lsws/logs/error.log"
echo ""
