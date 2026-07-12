# Bridge — AWS Deployment Guide (t3.nano / t3.micro)

This guide deploys **Bridge** to **AWS** on a single **t3.nano** ($3/mo) or **t3.micro** ($8/mo) instance, serving **https://bridge.globantislabs.com** with automatic HTTPS via Let's Encrypt.

The stack is **deliberately minimal**:
- **Caddy** (single binary, ~30MB RAM) — auto-SSL reverse proxy
- **Bridge Next.js app** (standalone build, ~150MB RAM) — your actual app
- **Supabase Postgres** (managed, free tier) — your database (NOT on the EC2)

Total memory footprint: **~200MB**, well within t3.nano's 512MB.

---

## 0. Architecture

```
                      Internet
                         │
                         ▼
                   ┌───────────┐
                   │  AWS EC2  │  t3.nano (0.5GB) or t3.micro (1GB)
                   │  Ubuntu   │
                   │           │
                   │  ┌─────┐  │   Port 80/443
                   │  │Caddy│◄─┼──────────────────  HTTPS
                   │  └──┬──┘  │
                   │     │     │
                   │  ┌──▼──┐  │   Port 3000 (internal)
                   │  │Bridge│ │
                   │  └──┬──┘  │
                   └─────┼─────┘
                         │
                         ▼
                  ┌──────────────┐
                  │   Supabase   │  Free 500MB Postgres
                  │   Postgres   │  (pooler URL, IPv4)
                  └──────────────┘
```

---

## 1. Prerequisites

- AWS account (free tier covers t3.micro for 750h/mo for 12 months)
- Domain `globantislabs.com` managed somewhere (Route 53, Cloudflare, GoDaddy, etc.)
- Supabase project already configured (you have the pooler URL + service role key)
- Local machine with `scp`/`rsync` to push files to EC2

---

## 2. Launch the EC2 instance

### 2.1 AMI

**Ubuntu Server 24.04 LTS** (x86_64) — `ami-0c55b159cbfafe1f0` (us-east-1) or search "ubuntu-jammy-22.04" in the AWS console.

### 2.2 Instance type

| Instance  | RAM  | CPU  | Price      | Recommendation                              |
|-----------|------|------|------------|---------------------------------------------|
| t3.nano   | 0.5G | 2 vCPU burst | ~$3/mo | **Best for solo / low-traffic Bridge**      |
| t3.micro  | 1.0G | 2 vCPU burst | ~$8/mo | Safer — more headroom for builds            |
| t3.small  | 2.0G | 2 vCPU burst | ~$17/mo | For 50+ concurrent users                     |

**Recommendation:** Start with **t3.micro** for the first build (npm needs ~600MB), then you can downgrade to **t3.nano** once the image is built and pushed to ECR. The included swap file (`deploy-t3.sh`) makes t3.nano workable.

### 2.3 Storage

- 8 GB gp3 EBS (root volume). Bridge image is ~150MB; 8GB is plenty.
- Don't encrypt unless required (saves cost).

### 2.4 Network

- **VPC:** default
- **Subnet:** public
- **Auto-assign public IP:** YES (required for Let's Encrypt)
- **Security group** — create one named `bridge-sg` with these inbound rules:

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22   | TCP      | YOUR IP | SSH access |
| 80   | TCP      | 0.0.0.0/0 | HTTP (Caddy redirects to HTTPS + Let's Encrypt challenge) |
| 443  | TCP      | 0.0.0.0/0 | HTTPS (your app) |
| 443  | UDP      | 0.0.0.0/0 | HTTP/3 (QUIC — better for WebRTC) |

### 2.5 Key pair

Create a new key pair (RSA, .pem) — save it securely. You'll use it to SSH in.

### 2.6 Launch

Click **Launch instance**. Wait ~60 seconds for it to boot.

---

## 3. Configure DNS

In your DNS provider (Route 53, Cloudflare, Namecheap, etc.):

```
Type:  A
Name:  bridge
Value: <EC2 public IPv4 address>
TTL:   300 (5 min — keep low during setup; can raise to 3600 after)
```

Verify:
```bash
dig +short bridge.globantislabs.com
# Should print your EC2 IP
```

If using **Cloudflare**, set the record to **DNS only** (gray cloud) initially so Let's Encrypt can verify via HTTP-01. You can enable the orange cloud (proxy) AFTER the certificate is issued.

---

## 4. Push the project to EC2

From your local machine:

```bash
# Unzip bridge-project-final-aws.zip on your local machine
unzip bridge-project-final-aws.zip -d bridge

# Make sure .env.production has your real values
# (especially DATABASE_URL, NEXT_PUBLIC_SUPABASE_*, AUTH_SECRET, etc.)

# Push the whole project to EC2
cd bridge
scp -i /path/to/your-key.pem -r . ubuntu@<EC2-IP>:~/bridge/
```

---

## 5. Bootstrap the EC2

SSH into the EC2:

```bash
ssh -i /path/to/your-key.pem ubuntu@<EC2-IP>
```

Then run the one-shot bootstrap:

```bash
cd ~/bridge
chmod +x aws/deploy-t3.sh
./aws/deploy-t3.sh
```

The script does **everything**:
1. ✅ Creates 1GB swap (essential for npm install on 0.5GB instances)
2. ✅ Installs Docker + Docker Compose v2
3. ✅ Validates `.env.production` (warns on missing vars, auto-generates AUTH_SECRET)
4. ✅ Builds + starts the containers
5. ✅ Waits for health check, verifies deployment

Expected output:
```
[1/7] Setting up swap...                     ✓
[2/7] Installing Docker...                   ✓
[3/7] Setting up project directory...        ✓
[4/7] Checking project files...              ✓
[5/7] Checking .env.production...            ✓
[6/7] Building and starting containers...    ✓ (~5-8 min on t3.micro, ~15 min on t3.nano)
[7/7] Verifying deployment...                ✓

============================================================
  Deployment complete!
============================================================
```

---

## 6. Verify the deployment

### 6.1 Local (from EC2)

```bash
curl http://localhost:3000/api/health
# {"status":"ok","database":true,"timestamp":"..."}
```

### 6.2 Public (from anywhere)

Wait 1-5 minutes for Caddy to fetch the TLS certificate, then:

```bash
curl https://bridge.globantislabs.com/api/health
```

Open in browser: **https://bridge.globantislabs.com**

---

## 7. Common operations

### View logs
```bash
cd ~/bridge
docker compose -f docker-compose.t3.yml logs -f
# Just the app:
docker compose -f docker-compose.t3.yml logs -f bridge
# Just Caddy (TLS cert issues show here):
docker compose -f docker-compose.t3.yml logs -f caddy
```

### Restart
```bash
cd ~/bridge
docker compose -f docker-compose.t3.yml restart
```

### Update code
```bash
# From local machine:
scp -i key.pem -r src/ ubuntu@<EC2-IP>:~/bridge/

# On EC2:
cd ~/bridge
docker compose -f docker-compose.t3.yml up -d --build
```

### Push DB schema changes
```bash
cd ~/bridge
docker compose -f docker-compose.t3.yml exec bridge ./node_modules/.bin/prisma db push
```

---

## 8. Troubleshooting

### Container won't start — "pre-flight failed"

The bridge container runs `node scripts/preflight.mjs` before starting. If the DB isn't reachable, it exits. Check:

```bash
docker compose -f docker-compose.t3.yml logs bridge | head -50
```

Most common cause: **DATABASE_URL password has special chars not URL-encoded**.
Fix: URL-encode `@` → `%40`, `#` → `%23`, `/` → `%2F` in the password.

### TLS certificate won't issue

Caddy needs port 80 reachable from the internet. Check:

1. EC2 security group has port 80 open to `0.0.0.0/0`
2. DNS A record points to the correct EC2 IP (`dig +short bridge.globantislabs.com`)
3. No Cloudflare proxy (orange cloud) during initial cert issuance

View Caddy's ACME logs:
```bash
docker compose -f docker-compose.t3.yml logs caddy | grep -i acme
```

### App is OOM-killed (t3.nano)

Symptoms: container restarts every few minutes, logs show `process out of memory`.

Fix 1 — Increase swap:
```bash
sudo swapoff /swapfile
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

Fix 2 — Reduce Node heap. Edit `.env.production`:
```
NODE_OPTIONS=--max-old-space-size=256
```
Then `docker compose -f docker-compose.t3.yml up -d`.

Fix 3 — Upgrade to t3.micro ($5/mo more).

### Build fails on EC2 (out of memory)

`t3.nano` has 512MB RAM. Even with 1GB swap, the Next.js build can OOM. Two options:

**Option A** — Build locally, push image to ECR, pull on EC2:
```bash
# Local:
docker build -f Dockerfile.t3 -t bridge:t3 .
docker tag bridge:t3 <acct>.dkr.ecr.us-east-1.amazonaws.com/bridge:t3
docker push <acct>.dkr.ecr.us-east-1.amazonaws.com/bridge:t3

# EC2 — edit docker-compose.t3.yml:
#   bridge:
#     image: <acct>.dkr.ecr.us-east-1.amazonaws.com/bridge:t3
#     # remove the `build:` block
docker compose -f docker-compose.t3.yml up -d
```

**Option B** — Use t3.micro for the first build, snapshot the EBS, then launch t3.nano from that snapshot.

### Supabase "Authentication failed" (P1000)

The `Credora2026` password keeps getting rejected. The Supabase database password is **separate** from your Supabase account login password. Reset it:

1. Supabase dashboard → your project → **Project Settings** → **Database**
2. Click **Reset database password**
3. Use the new password in `DATABASE_URL` (URL-encode special chars)
4. Restart: `docker compose -f docker-compose.t3.yml restart bridge`

---

## 9. Cost estimate

| Resource        | Tier        | Monthly cost |
|-----------------|-------------|--------------|
| EC2 t3.nano     | On-demand   | $3.02        |
| EBS 8GB gp3     |             | $0.67        |
| Supabase        | Free        | $0           |
| Let's Encrypt   | Free        | $0           |
| Route 53 (1 zone) |           | $0.50        |
| Data transfer   | Free tier   | $0 (first 100GB) |
| **Total**       |             | **~$4.19/mo** |

For t3.micro: add ~$5/mo → **~$9/mo total**.

---

## 10. Production hardening checklist

Before going live with real users:

- [ ] **EC2 IAM role** — attach an instance profile with least-privilege SSM access (so you can drop port 22 from the security group)
- [ ] **EBS encryption** — enable on the root volume (free)
- [ ] **Backups** — enable EBS snapshots (AWS Backup, ~$0.05/GB/mo)
- [ ] **CloudWatch agent** — install for memory/disk metrics (free tier covers it)
- [ ] **Auth secrets** — verify AUTH_SECRET + NEXTAUTH_SECRET are set, not placeholders
- [ ] **DB backups** — Supabase free tier has PITR for 7 days; verify it's enabled
- [ ] **Monitoring** — set up UptimeRobot / Better Stack ping on `https://bridge.globantislabs.com/api/health` (free)
- [ ] **TURN server** — uncomment the coturn block in `docker-compose.t3.yml` if users behind corporate NAT can't connect to meetings

---

## 11. Quick reference

| What | Where |
|------|-------|
| App URL | https://bridge.globantislabs.com |
| Health check | https://bridge.globantislabs.com/api/health |
| Project dir on EC2 | `~/bridge` |
| Compose file | `docker-compose.t3.yml` |
| Env file | `.env.production` |
| Caddy config | `aws/caddy/Caddyfile` |
| Caddy TLS certs | Docker volume `caddy-data` (persisted) |
| App logs | `docker compose logs bridge` |
| Caddy logs | `docker compose logs caddy` |
| Swap file | `/swapfile` (1GB) |

---

**Need help?** Check the troubleshooting section, then `docker compose -f docker-compose.t3.yml logs` for details.
