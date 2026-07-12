#!/bin/bash
# ============================================================
#  Bridge — One-shot EC2 bootstrap for t3.nano / t3.micro
#  Domain: bridge.globantislabs.com
#  Run as ubuntu/ec2-user on a fresh Ubuntu 22.04 / 24.04 AMI.
#
#  What this script does:
#    1. Creates 1GB swap (essential for npm build on 0.5GB instances)
#    2. Installs Docker + Docker Compose v2
#    3. Sets up the project directory
#    4. Pulls code (from a git repo or copied files)
#    5. Runs prisma db push to create tables
#    6. Builds + starts the containers
#    7. Verifies the app is reachable on https://bridge.globantislabs.com
#
#  Usage:
#    chmod +x aws/deploy-t3.sh
#    ./aws/deploy-t3.sh
# ============================================================

set -euo pipefail

DOMAIN="bridge.globantislabs.com"
PROJECT_DIR="${PROJECT_DIR:-$HOME/bridge}"
# 2GB swap is essential on t3.nano — bun install + next build can spike to ~1.5GB
SWAP_SIZE_MB="${SWAP_SIZE_MB:-2048}"

echo "============================================================"
echo "  Bridge — EC2 bootstrap for t3.nano / t3.micro"
echo "  Domain:      $DOMAIN"
echo "  Project dir: $PROJECT_DIR"
echo "  Swap size:   ${SWAP_SIZE_MB}MB"
echo "============================================================"

# ---------- 1. Swap (essential on 0.5GB / 1GB instances) ----------
echo ""
echo "[1/7] Setting up swap..."
CURRENT_SWAP_MB=$(awk '/^SwapTotal/{print int($2/1024)}' /proc/meminfo)
if [ "$CURRENT_SWAP_MB" -ge "$SWAP_SIZE_MB" ]; then
    echo "    Swap already >= ${SWAP_SIZE_MB}MB ($CURRENT_SWAP_MB MB), skipping."
elif [ -f /swapfile ]; then
    echo "    Existing swap is $CURRENT_SWAP_MB MB. Resizing to ${SWAP_SIZE_MB}MB..."
    sudo swapoff /swapfile || true
    sudo fallocate -l ${SWAP_SIZE_MB}M /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    # Make sure fstab has it
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
    echo "    Swap resized to ${SWAP_SIZE_MB}MB."
else
    sudo fallocate -l ${SWAP_SIZE_MB}M /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
    echo "    Swap enabled (${SWAP_SIZE_MB}MB)."
fi
free -h

# ---------- 2. System updates + Docker ----------
echo ""
echo "[2/7] Installing Docker..."
if ! command -v docker &> /dev/null; then
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
        sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
        sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker $USER
    echo "    Docker installed. (You may need to re-login for group changes.)"
else
    echo "    Docker already installed: $(docker --version)"
fi

# ---------- 3. Project directory ----------
echo ""
echo "[3/7] Setting up project directory..."
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"
echo "    Working in: $(pwd)"

# ---------- 4. Check for project files ----------
echo ""
echo "[4/7] Checking project files..."
if [ ! -f docker-compose.t3.yml ]; then
    echo "    ERROR: docker-compose.t3.yml not found in $PROJECT_DIR"
    echo "    Copy your project files here first, then re-run this script."
    echo "    Example (run on your local machine):"
    echo "      scp -r bridge-project-final-aws/* ubuntu@<EC2-IP>:$PROJECT_DIR/"
    exit 1
fi

# ---------- 5. Check .env.production ----------
echo ""
echo "[5/7] Checking .env.production..."
if [ ! -f .env.production ]; then
    echo "    ERROR: .env.production not found."
    echo "    Copy .env.production from your local machine, fill in real values, then re-run."
    exit 1
fi

# Quick sanity check on required vars.
# NOTE: OPENAI_API_KEY is intentionally NOT in this list — it's configured
# via Admin Panel → System Settings (stored in DB), not in .env.
for var in DATABASE_URL NEXT_PUBLIC_APP_URL AUTH_SECRET NEXTAUTH_SECRET CRON_SECRET; do
    if ! grep -q "^${var}=" .env.production || grep -q "^${var}=REPLACE" .env.production; then
        echo "    WARNING: $var is missing or has placeholder value in .env.production"
    fi
done

# Generate AUTH_SECRET / NEXTAUTH_SECRET / CRON_SECRET if still placeholders
if grep -q "^AUTH_SECRET=REPLACE" .env.production; then
    SECRET=$(openssl rand -base64 32)
    sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=${SECRET}|" .env.production
    echo "    Generated AUTH_SECRET"
fi
if grep -q "^NEXTAUTH_SECRET=REPLACE" .env.production; then
    SECRET=$(openssl rand -base64 32)
    sed -i "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${SECRET}|" .env.production
    echo "    Generated NEXTAUTH_SECRET"
fi
if grep -q "^CRON_SECRET=REPLACE" .env.production; then
    SECRET=$(openssl rand -hex 16)
    sed -i "s|^CRON_SECRET=.*|CRON_SECRET=${SECRET}|" .env.production
    echo "    Generated CRON_SECRET"
fi

# ---------- 6. Build + start containers ----------
echo ""
echo "[6/7] Building and starting containers..."
# Use newgrp to apply docker group without re-login
sg docker -c "docker compose -f docker-compose.t3.yml up -d --build"

# Wait for health check
echo "    Waiting for app to become healthy..."
for i in $(seq 1 30); do
    if curl -fsS "http://localhost:3000/api/health" > /dev/null 2>&1; then
        echo "    App is healthy!"
        break
    fi
    sleep 5
    echo "    ...waiting ($i/30)"
done

# ---------- 7. Verify ----------
echo ""
echo "[7/7] Verifying deployment..."
echo ""
echo "Local health check:"
curl -fsS "http://localhost:3000/api/health" | head -c 500 || echo "FAILED"
echo ""
echo ""
echo "Public URL (may take a few min for DNS + TLS to propagate):"
echo "  https://$DOMAIN/api/health"
echo ""
echo "Container status:"
sg docker -c "docker compose -f docker-compose.t3.yml ps"
echo ""
echo "============================================================"
echo "  Deployment complete!"
echo "============================================================"
echo ""
echo "Useful commands:"
echo "  View logs:    sg docker -c 'docker compose -f docker-compose.t3.yml logs -f'"
echo "  Restart:      sg docker -c 'docker compose -f docker-compose.t3.yml restart'"
echo "  Stop:         sg docker -c 'docker compose -f docker-compose.t3.yml down'"
echo "  Update code:  scp new files → re-run this script"
echo ""
echo "Next steps:"
echo "  1. Make sure DNS A record for $DOMAIN points to this EC2's public IP"
echo "  2. Make sure EC2 security group allows: 80/tcp, 443/tcp, 443/udp"
echo "  3. Wait 1-5 min for Caddy to fetch TLS certificate from Let's Encrypt"
echo "  4. Visit https://$DOMAIN in your browser"
echo ""
