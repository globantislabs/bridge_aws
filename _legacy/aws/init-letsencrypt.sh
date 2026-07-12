#!/bin/bash
# ============================================================
#  Bridge — SSL certificate bootstrap with Let's Encrypt
#  Run ONCE on the EC2 host before `docker compose -f docker-compose.prod.yml up -d`.
#  Issues a real certificate for bridge.globantislabs.com.
# ============================================================
#  Prerequisites:
#    - DNS A record for bridge.globantislabs.com → EC2 public IP
#    - Port 80 + 443 open in the EC2 security group
#    - .env.production exists with DOMAIN=bridge.globantislabs.com
# ============================================================

set -euo pipefail

DOMAIN="bridge.globantislabs.com"
EMAIL="${1:-admin@globantislabs.com}"

cd "$(dirname "$0")/.."

echo "============================================================"
echo "  Bridge — Let's Encrypt SSL bootstrap"
echo "  Domain: $DOMAIN"
echo "  Email:  $EMAIL"
echo "============================================================"

# ---------- 1. Make sure certbot dirs exist ----------
mkdir -p aws/certbot/www
mkdir -p aws/certbot/conf

# ---------- 2. Get the certificate (standalone, no nginx needed yet) ----------
echo ""
echo "[1/3] Requesting certificate from Let's Encrypt..."
docker run --rm \
  -p 80:80 \
  -v "$(pwd)/aws/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/aws/certbot/www:/var/www/certbot" \
  certbot/certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN"

# ---------- 3. Symlink so the docker-compose volume mount path matches ----------
# nginx.conf expects /etc/letsencrypt/live/bridge.globantislabs.com/...
# This is already the layout certbot creates, so no symlink needed.
echo ""
echo "[2/3] Certificate issued successfully."
ls -la aws/certbot/conf/live/$DOMAIN/

# ---------- 4. Symlink certs into the path nginx expects ----------
# Tell the user what to do next.
echo ""
echo "[3/3] Next steps:"
echo "  1. Edit docker-compose.prod.yml — mount ./aws/certbot/conf:/etc/letsencrypt:ro"
echo "     and ./aws/certbot/www:/var/www/certbot:ro in the nginx service."
echo "  2. Start the stack:"
echo "       docker compose -f docker-compose.prod.yml up -d --build"
echo "  3. Verify: https://$DOMAIN/api/health"
echo ""
echo "Done."
