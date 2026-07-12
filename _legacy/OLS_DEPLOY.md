# Bridge — OpenLiteSpeed (OLS) Deployment Guide

This guide walks you through deploying Bridge to a server running **OpenLiteSpeed 1.7+** as the reverse proxy, with **Node.js standalone** as the app server and **Supabase Postgres** as the database.

---

## Architecture

```
                    ┌──────────────────────┐
                    │   Browser (client)   │
                    └──────────┬───────────┘
                               │ HTTPS (443) + HTTP/3
                               ▼
                    ┌──────────────────────┐
                    │  OpenLiteSpeed       │
                    │  (reverse proxy +    │
                    │   static file cache) │
                    └──────────┬───────────┘
                               │ HTTP (127.0.0.1:3000)
                               ▼
                    ┌──────────────────────┐
                    │  Node.js standalone  │
                    │  (Next.js server.js) │
                    │  systemd: bridge     │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Supabase Postgres   │
                    │  (remote, pooled)    │
                    └──────────────────────┘
```

**Why this setup:**
- OLS is faster than nginx for static + dynamic mixed workloads (event-driven, fewer threads)
- OLS handles HTTP/3, Brotli, and Let's Encrypt auto-renewal natively
- Node.js standalone keeps the app process isolated and restartable via systemd
- Supabase gives you a managed Postgres with connection pooling so you don't run a local DB

---

## Prerequisites

- A server running **Ubuntu 22.04+** with **OpenLiteSpeed 1.7+** installed
- A **domain name** pointing to your server's IP (A record)
- A **Supabase project** with the connection string ready
- An **OpenAI API key** (optional but required for real-time voice translation)
- Ports `22`, `80`, `443/tcp`, `443/udp` open in your cloud firewall
- At least **1 GB RAM** (2 GB recommended for builds)

---

## Step 1 — Prepare the project on your server

```bash
# Become root
sudo -i

# Create the app directory
mkdir -p /var/www/bridge

# Copy the project files (use scp, rsync, or git clone)
# Example with rsync from your local machine:
#   rsync -avz --exclude node_modules --exclude .next --exclude .git \
#     ./bridge/ root@YOUR_SERVER:/var/www/bridge/

cd /var/www/bridge
```

---

## Step 2 — Configure `.env`

```bash
cd /var/www/bridge
cp .env.example .env
nano .env
```

Fill in these **required** values:

| Variable | Where to get it |
|----------|-----------------|
| `DATABASE_URL` | Supabase dashboard → Project Settings → Database → Connection string → **Transaction pooler** (port 5432, IPv4) |
| `DIRECT_URL`   | Supabase dashboard → Project Settings → Database → Connection string → **Session pooler** or **Direct connection** (port 5432, IPv6) |
| `AUTH_SECRET`  | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_SECRET` | Same — generate a second one |
| `CRON_SECRET`  | Generate a third one (used by /api/cron/*) |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys (required for voice translation) |

**Optional but recommended:**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — only if you want Google OAuth login
- `TURN_URL`, `TURN_USER`, `TURN_PASS` — for WebRTC NAT traversal (use [coturn](https://github.com/coturn/coturn) self-hosted or [Twilio TURN](https://www.twilio.com/stun-turn))
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — for email invites (use [Resend](https://resend.com), [Postmark](https://postmarkapp.com), or Gmail SMTP)

---

## Step 3 — One-shot deploy

```bash
cd /var/www/bridge
sudo bash ols/deploy-ols.sh your-domain.com
```

This script will:
1. Install Node 20 + bun (if missing)
2. Install OLS (if missing)
3. Run `bun install` + `prisma generate` + `prisma db push`
4. Build Next.js standalone output
5. Create a systemd service `bridge` running on port 3000
6. Register the OLS vhost
7. Provision Let's Encrypt SSL
8. Configure UFW firewall

When it finishes, you'll see manual steps printed to the console for the OLS listener mapping (WebAdmin UI).

---

## Step 4 — Map the vhost in OLS WebAdmin

OLS requires you to manually map the vhost to a listener. This is a one-time setup.

1. Open `https://YOUR_SERVER_IP:7080` (OLS WebAdmin). Default login: `admin` / the password you set during OLS install.
2. Go to **Listeners → HTTP (port 80)** → **Virtual Hosts** tab → **Add** → select `bridge` → Save
3. Go to **Listeners → HTTPS (port 443)** → **Virtual Hosts** tab → **Add** → select `bridge` → Save
4. (Optional) In the HTTPS listener → **SSL** tab → upload your Let's Encrypt cert:
   - Cert: `/etc/letsencrypt/live/your-domain.com/fullchain.pem`
   - Key: `/etc/letsencrypt/live/your-domain.com/privkey.pem`
5. (Optional) Enable **HTTP/3** in the HTTPS listener → **SSL** tab → check "Enable HTTP/3 (QUIC)"
6. Click **Graceful Restart** in the top-right.

---

## Step 5 — Verify

```bash
# Health check
curl -I https://your-domain.com/api/health
# Expect: HTTP/2 200

# Static asset cache headers
curl -I https://your-domain.com/_next/static/chunks/webpack-*.js
# Expect: cache-control: public, max-age=31536000, immutable

# Open the app
open https://your-domain.com
```

You should see the Bridge landing page. Sign up, create a meeting, and test the full flow.

---

## Step 6 — Configure the OpenAI Realtime key

Once logged in as the super admin (the first user to sign up becomes admin automatically):

1. Go to **Admin → System Settings**
2. Paste your OpenAI API key in the **OpenAI Realtime API key** field
3. (Optional) Set the model to `gpt-4o-realtime-preview-2024-12-17` (default)
4. Save

Now the live translation panel will use the Realtime API instead of the browser Web Speech API fallback.

---

## WebAdmin → Tuning recommendations

In OLS WebAdmin → **Configuration → Tuning**:

| Setting | Recommended |
|---------|-------------|
| Max Connections | 1000 |
| Max SSL Connections | 1000 |
| Connection Timeout | 300 (for long-poll signaling) |
| Keep-Alive Timeout | 60 |
| Enable Gzip Compression | ✅ |
| Enable Brotli Compression | ✅ (if available) |
| Compressible Types | `text/html, text/css, application/javascript, application/json, image/svg+xml` |

In **Configuration → Server → Security**:
- Enable **Deny by Static IP** for `/api/admin/*` if you want extra protection
- Set **Max Request Body Size** to 50 MB (for whiteboard image uploads)

---

## Common Issues

### 1. "503 Service Unavailable"
Node isn't running. Check:
```bash
systemctl status bridge
journalctl -u bridge -n 50 --no-pager
```
Most common cause: a missing env var. The preflight script (`scripts/preflight.mjs`) will exit 1 if `DATABASE_URL` is unreachable or `AUTH_SECRET` is missing.

### 2. WebSocket fails for live translation
OLS proxies WebSocket traffic natively, but you must ensure:
- The `extProcessor` has `respBuffer 0` (already set in our vhost config — this disables response buffering so WS frames pass through)
- The listener is mapped to the bridge vhost (see Step 4)
- Your firewall allows `443/udp` (HTTP/3) — though WS uses 443/tcp

### 3. Audio/Video not working
Bridge uses raw WebRTC peer-to-peer. If participants can't see/hear each other:
- You need a **TURN server** for users behind strict NATs. Add TURN credentials via Admin → System Settings.
- Without TURN, ~30% of connections behind corporate firewalls will fail.
- Recommend [coturn](https://github.com/coturn/coturn) self-hosted, or [Twilio TURN](https://www.twilio.com/stun-turn) for managed.

### 4. Build runs out of memory (OOM)
On a 1 GB server, the Next.js build can OOM. Add swap:
```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```
Then re-run the deploy script.

### 5. Prisma migration fails
If `prisma db push` fails with "P1000: authentication failed":
- Triple-check the password in `DATABASE_URL`. Supabase's pooler URL format is:
  `postgresql://postgres.REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres`
- The `PASSWORD` must be URL-encoded if it contains special characters (`@` → `%40`, etc.)
- Use the **session pooler** (port 5432) for `DATABASE_URL`, not the direct connection (which is IPv6-only and won't work from some clouds)

### 6. iOS Safari: video not showing / can't hear audio
This was a known issue and has been fixed in this build:
- All `<video>` elements have `playsInline` + `disablePictureInPicture` + `disableRemotePlayback`
- The container uses `100dvh` instead of `100vh` (handles Safari's dynamic toolbars)
- The meeting room container uses `fixed inset-0` (correct for fullscreen WebRTC)
- iOS Safari requires an explicit user gesture to start audio — the "Join meeting" button click satisfies this

If you still see issues, ensure iOS is on version 14.5+ (older versions don't support `playsInline` properly).

---

## Maintenance

### Update the app
```bash
cd /var/www/bridge
git pull   # or scp new files
bun install --frozen-lockfile
bunx prisma generate
bunx prisma db push --accept-data-loss
NODE_OPTIONS="--max-old-space-size=1024" bun run build
cp -r .next/standalone /var/www/bridge-server
cp -r .next/static /var/www/bridge-server/.next/static
cp -r public /var/www/bridge-server/public
chown -R www-data:www-data /var/www/bridge-server
systemctl restart bridge
```

### View logs
```bash
# App logs
journalctl -u bridge -f

# OLS error log
tail -f /usr/local/lsws/logs/error.log

# OLS access log
tail -f /usr/local/lsws/logs/access.log
```

### Restart services
```bash
systemctl restart bridge           # Restart Node app
/usr/local/lsws/bin/lswsctrl restart   # Restart OLS
```

### SSL renewal
Let's Encrypt certs expire in 90 days. Set up auto-renewal:
```bash
# Add to /etc/cron.d/certbot:
0 3 * * * root certbot renew --quiet --deploy-hook "/usr/local/lsws/bin/lswsctrl restart"
```

---

## Cost Estimate

For a small team (up to 50 active users, ~5 concurrent meetings):

| Component | Provider | Cost |
|-----------|----------|------|
| VPS (2 GB RAM) | Hetzner / DigitalOcean | $4–12/mo |
| Supabase (free tier) | Supabase | $0 (up to 500 MB DB, 50K MAU) |
| OpenAI Realtime API | OpenAI | ~$0.06/min audio (~$36/meeting-hour for 2 languages) |
| OpenAI Chat (text translation) | OpenAI | ~$0.15 per 1M tokens |
| Domain | Any registrar | $10–15/yr |
| **Total** | | **~$10/mo + usage** |

The biggest variable is OpenAI Realtime. To control costs:
- Use the **batch translation endpoint** (`/api/translate/batch`) for chat translation
- The in-memory LRU cache (5-min TTL) dedupes repeated phrases
- Activity log writes are throttled (1 per 5 calls) to reduce DB load
- Set per-user daily quotas in the admin panel

---

## Comparison: OLS vs nginx vs Caddy

| Feature | OLS | nginx | Caddy |
|---------|-----|-------|-------|
| HTTP/3 (QUIC) | ✅ built-in | ❌ (needs patch) | ✅ |
| Brotli | ✅ | ✅ (module) | ✅ |
| Let's Encrypt | ✅ (plugin) | ❌ (manual certbot) | ✅ (auto) |
| WebSocket proxy | ✅ | ✅ | ✅ |
| Admin UI | ✅ WebAdmin | ❌ | ❌ |
| Memory footprint | ~30 MB | ~10 MB | ~30 MB |
| Config syntax | XML | nginx.conf | Caddyfile |
| Best for | LSCache WordPress users | High-performance static | Quick SSL + simple setups |

For Bridge, all three work equally well. OLS is recommended if you already have it installed or want the WebAdmin UI.

---

## Need help?

- Project worklog: `/var/www/bridge/worklog.md` (full history of all changes)
- Test report: see `TEST_REPORT.md` in the project root
- API smoke tests: `cd /var/www/bridge && node scripts/test-api.mjs`
- DB diagnostics: `cd /var/www/bridge && node scripts/diagnose-db.mjs`
