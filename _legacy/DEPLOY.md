# Bridge — Production Deployment Guide

This guide walks you through deploying Bridge to **AWS** using **Supabase Postgres** (free tier) and **raw WebRTC** (no LiveKit, no paid SFU). Total monthly cost at low traffic: **~$5–15**.

---

## 0. Prerequisites

- AWS account (free tier is fine to start)
- Supabase account (free tier — 500MB Postgres, 50k MAU)
- Domain name (optional but recommended)
- Docker installed locally for building

---

## 1. Configure Supabase Postgres (free tier)

1. Go to **https://supabase.com** → New Project → name it `bridge`
2. Wait ~2 min for the project to provision
3. Open **Project Settings → Database → Connection string → URI**
4. Copy the **Session pooler** URL (port `5432`, NOT `6543` direct). It looks like:
   ```
   postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
   ```
5. Paste into your `.env`:
   ```
   DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
   ```
6. Push the schema:
   ```bash
   bunx prisma db push
   bunx prisma generate
   ```

**Why Supabase?** Free 500MB Postgres with backups, point-in-time recovery, and a query editor. Way better than SQLite for production. The pooler handles 200+ concurrent connections.

---

## 2. Build the Docker image

```bash
docker build -t bridge:latest .
docker tag bridge:latest <aws-account-id>.dkr.ecr.<region>.amazonaws.com/bridge:latest
```

Push to ECR (or Docker Hub, GHCR — anywhere App Runner can pull from):

```bash
aws ecr create-repository --repository-name bridge --region us-east-1
aws ecr get-login-password | docker login --username AWS --password-stdin <acct>.dkr.ecr.us-east-1.amazonaws.com
docker push <acct>.dkr.ecr.us-east-1.amazonaws.com/bridge:latest
```

---

## 3. Deploy on AWS App Runner (recommended — simplest)

App Runner auto-scales, load-balances, and gives you a free HTTPS URL.

1. AWS Console → **App Runner → Create service**
2. **Source**: Container registry → ECR → `bridge:latest`
3. **Port**: `3000`
4. **Environment variables** — paste every var from `.env`:
   ```
   DATABASE_URL=postgresql://...@supabase.com:5432/postgres
   NEXT_PUBLIC_APP_URL=https://<your-domain>.com
   NODE_ENV=production
   OPENAI_API_KEY=sk-...
   CRON_SECRET=<random-32-char-string>
   ... (all others from .env)
   ```
5. **Health check**: path `/api/health`, interval 30s
6. **Auto-scaling**: min 1, max 5 instances (free tier covers 1)
7. Click **Create & deploy**

App Runner gives you a URL like `https://<random>.us-east-1.awsapprunner.com`. The container will:
1. Run `node scripts/preflight.mjs` — verifies DB reachable + tables exist
2. If pre-flight passes, start `node server.js`
3. If pre-flight fails, container exits → App Runner restarts it → you see the error in logs

---

## 4. Set up a domain + HTTPS

1. **Route 53** → create hosted zone for your domain
2. **App Runner → Custom domains** → add your domain → it gives you a CNAME
3. Add the CNAME to Route 53 → wait 5 min → HTTPS is auto-provisioned
4. Update `NEXT_PUBLIC_APP_URL` env var to `https://yourdomain.com` and redeploy

---

## 5. Set up TURN for WebRTC (required for cross-network calls)

Raw WebRTC works peer-to-peer for same-network, but cross-network calls (e.g. you and a client on different ISPs) need a TURN server.

**Option A — Free coturn on a $5 EC2 instance (recommended):**

```bash
# Launch Ubuntu 22.04 EC2 (t3.micro, free tier)
ssh ubuntu@<ec2-ip>

sudo apt update && sudo apt install -y coturn
sudo tee /etc/turnserver.conf <<EOF
realm=turn.yourdomain.com
server-name=turn.yourdomain.com
listening-port=3478
fingerprint
user=bridge:$(openssl rand -hex 16)
no-tcp-relay
no-cli
min-port=49152
max-port=65535
EOF

sudo systemctl enable --now coturn

# Open security group: UDP 3478, TCP 3478, UDP 49152-65535
```

Then in `.env`:
```
STUN_URL=stun:turn.yourdomain.com:3478
TURN_URL=turn:turn.yourdomain.com:3478
TURN_USER=bridge
TURN_PASS=<the hex string from above>
```

**Option B — paid managed TURN** (Twilio Network Traversal Service, Xirsys, Cloudflare TURN) — easier but ~$0.001/min/user.

---

## 6. Set up the session-purge cron

Expired sessions pile up in the DB. Purge hourly:

**AWS EventBridge → Rules → Create rule:**
- Schedule: `rate(1 hour)`
- Target: App Runner service (or a Lambda that hits your endpoint)
- Or simpler — use **cron-job.org** (free) pointed at:
  ```
  https://yourdomain.com/api/cron/sessions-purge
  Header: x-cron-secret: <your CRON_SECRET>
  ```

---

## 7. Pre-flight check (do this BEFORE going live)

```bash
# On your local machine, against the production URL:
BASE_URL=https://yourdomain.com node scripts/test-api.mjs
```

This hits `/api/health`, logs in as admin, creates a meeting, hits every admin endpoint, and reports pass/fail. If anything fails, fix it before announcing the launch.

You can also run the pre-flight check inside the container:
```bash
docker exec -it <container-id> node scripts/preflight.mjs
```

---

## 8. Architecture summary

```
                    ┌──────────────────┐
                    │   AWS App Runner │  ← auto-scale 1-5 instances
                    │   (Next.js)      │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       ┌──────▼──────┐  ┌────▼─────┐  ┌─────▼─────┐
       │  Supabase   │  │  OpenAI  │  │  coturn   │
       │  Postgres   │  │  (TTS/STT│  │  (TURN)   │
       │  (free)     │  │   paid)  │  │  ($5 EC2) │
       └─────────────┘  └──────────┘  └───────────┘
```

**Sessions**: DB-backed (Session table) — works across multiple App Runner instances. Survives restarts.

**2FA**: TOTP via `otplib`. Users can enable in Settings. Backup codes provided.

**Rate limiting**: in-memory token bucket. **For multi-instance**, swap to Redis:
```ts
// src/lib/rate-limit-redis.ts (future)
import { Redis } from 'ioredis'
// ...
```

**WebRTC**: P2P mesh. Works up to ~6-8 participants per room. For larger rooms, add an SFU (LiveKit Cloud, Daily, or self-hosted mediasoup — but P2P is free).

---

## 9. Cost estimate (low traffic, ~100 DAU)

| Service | Cost/month |
|---|---|
| AWS App Runner (1 instance, 1 vCPU / 2GB) | ~$15 |
| Supabase Postgres (free tier) | $0 |
| EC2 t3.micro for coturn | ~$5 |
| Route 53 (1 hosted zone) | $0.50 |
| OpenAI API (translation, pay per use) | $5–20 |
| **Total** | **~$25–40/month** |

---

## 10. Troubleshooting

### `Pre-flight FAILED` in container logs
- DB connection refused → check `DATABASE_URL`, ensure Supabase project is active
- Table missing → run `bunx prisma db push` against the prod DB
- Env var missing → App Runner → Configuration → Environment variables

### Login fails with 401 even with right password
- The first login auto-bootstraps `admin@bridge.app / admin1234` — make sure your DB is reachable
- Check `/api/health` returns 200

### WebRTC video doesn't connect between two different networks
- You need TURN (section 5). STUN alone is not enough for symmetric NATs.
- Check `TURN_URL` / `TURN_USER` / `TURN_PASS` are set

### 2FA locked me out
- Use one of the 8 backup codes shown during setup
- If you lost those, connect to the DB and run:
  ```sql
  DELETE FROM "TwoFactorSecret" WHERE "userId" = '<your-user-id>';
  ```

---

## 11. Quick reference — commands

```bash
# Local dev
bun install
bunx prisma db push
bun run dev

# Production build + run
bun run build
bun run start

# Pre-flight check (before deploy)
bun run preflight

# API smoke test (against running server)
bun run test:api

# Docker
docker build -t bridge:latest .
docker run -p 3000:3000 --env-file .env bridge:latest

# Push schema to prod DB
DATABASE_URL="postgresql://...supabase..." bunx prisma db push
```
