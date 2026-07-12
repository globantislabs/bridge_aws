# Bridge — Production Setup Guide

This guide walks you through taking Bridge from sandbox mode to a fully production-ready deployment with Supabase Auth, OpenAI Realtime API, SMTP email, and WebRTC TURN.

---

## 1. Prerequisites

- **Node.js 20+** or **Bun** (recommended — `bun install` & `bun run`)
- A Supabase project (free tier works): https://supabase.com
- An OpenAI account with API access (for live voice translation)
- An SMTP provider (Gmail with App Password works for low volume; SendGrid/Mailgun/SES for production)
- A TURN server for WebRTC (optional for dev, **required** for production)

---

## 2. Install dependencies

```bash
bun install
```

### Troubleshooting: `@prisma/engines` ECONNRESET

If `bun install` fails with `ECONNRESET` during the `@prisma/engines` postinstall
(the engine binary download times out on slow connections), use one of these fixes:

**Option A — Set the Prisma engine mirror (recommended)**

The `.env` file already includes `PRISMA_ENGINES_MIRROR`, but if your shell
doesn't auto-load `.env` during install, set it explicitly first:

```powershell
# Windows PowerShell
$env:PRISMA_ENGINES_MIRROR = "https://binaries.prisma.sh"
bun install
```

```bash
# macOS / Linux
export PRISMA_ENGINES_MIRROR="https://binaries.prisma.sh"
bun install
```

**Option B — Skip postinstall scripts and generate manually**

```bash
bun install --ignore-scripts
bunx prisma generate
```

This skips the engine download during install and generates the Prisma client
from the cached engine the next time you run any `prisma` command.

---

## 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in the values you need. **Every variable is optional** — Bridge runs in sandbox mode with sensible fallbacks when env vars are missing, but production features (real Google OAuth, live voice translation, real email delivery) require the corresponding vars.

### 3a. Database

Bridge uses **PostgreSQL** (via Supabase) as its only database backend.
Get your connection string from: Supabase Dashboard → Project Settings →
Database → Connection string → URI → Session pooler (port 5432).

```
DATABASE_URL=postgresql://postgres.REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

Then initialize the schema:

```bash
bunx prisma db push
bunx prisma generate
```

### 3b. Supabase + Google OAuth

1. Go to https://supabase.com and create a new project.
2. In Supabase Dashboard → **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only!)
3. In Supabase Dashboard → **Authentication → Providers → Google**:
   - Enable Google
   - Add your Google OAuth Client ID + Secret (create at https://console.cloud.google.com/apis/credentials)
   - Set the redirect URL to: `https://YOUR_DOMAIN/api/auth/callback`
4. In Google Cloud Console → **OAuth consent screen**, add your domain to authorized domains.
5. Restart Bridge. The sign-in modal will now route through real Supabase Auth.

### 3c. OpenAI Realtime API (live voice translation)

1. Get an API key from https://platform.openai.com/api-keys
2. Add to `.env`:

```
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
OPENAI_TRANSLATE_MODEL=gpt-4o-mini
```

**OR** set the key live via the Admin Panel → System settings → `openai_realtime_api_key` (no redeploy needed — DB-stored, takes effect in 30 seconds).

When configured, the Live Translation panel in meetings will use OpenAI's Realtime API for sub-second voice interpretation. Without it, the panel falls back to the browser's Web Speech API (Chrome/Edge/Safari only).

### 3d. SMTP (real email delivery)

For Gmail (low volume, <500 emails/day):

1. Enable 2FA on your Google account: https://myaccount.google.com/security
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Set in `.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=you@gmail.com
```

For production volume, use SendGrid / Mailgun / Amazon SES. Example (SendGrid):

```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your-api-key
SMTP_FROM=noreply@your-domain.com
```

**OR** set SMTP creds live via the Admin Panel → System settings.

### 3e. WebRTC TURN (required for production meetings)

Without TURN, users behind symmetric NATs (corporate Wi-Fi, cellular) cannot establish peer-to-peer audio/video. Recommended providers:

- **Twilio NAT Traversal Service** — easy, pay-as-you-go
- **Xirsys** — simple, has a free tier
- **Self-hosted coturn** — free, requires your own server

After obtaining TURN credentials, set in `.env`:

```
TURN_URL=turn:turn.your-domain.com:3478
TURN_USER=your-username
TURN_PASS=your-password
STUN_URL=stun:stun.l.google.com:19302
```

**OR** set via Admin Panel → System settings.

### 3f. Scheduled email dispatch

Bridge supports "schedule send" in the email composer. To actually dispatch scheduled emails, set up an external cron job (cron-job.org, systemd timer, Vercel Cron, Caddy cron, etc.) that calls this endpoint every 5-10 minutes:

```bash
curl -X POST https://your-domain.com/api/cron/scheduled-emails \
     -H "x-cron-secret: $CRON_SECRET"
```

Set `CRON_SECRET` in `.env` to a random string and use the same value in the cron job's header. If `CRON_SECRET` is not set, the endpoint is open (dev mode only — do NOT do this in production).

---

## 4. Seed demo data (optional, dev only)

To create demo users, meetings, emails, and tokens:

```bash
curl -X POST http://localhost:3000/api/seed
```

Default seeded accounts:
- `demo@bridge.app` / `demo1234` (regular user)
- `admin@bridge.app` / `admin1234` (super admin)

---

## 5. Run in development

```bash
bun run dev
```

Open http://localhost:3000.

---

## 6. Build for production

```bash
bun run build
bun run start
```

The build outputs a standalone Next.js server in `.next/standalone/`. For Docker/PM2 deployment, use `bun .next/standalone/server.js`.

---

## 7. Production checklist

- [ ] `.env` has `DATABASE_URL` pointing to Postgres (not SQLite)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` set
- [ ] Google OAuth redirect URL configured in Supabase + Google Cloud Console
- [ ] `OPENAI_API_KEY` set (live voice translation works in meetings)
- [ ] `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` set (real email sending works)
- [ ] `TURN_URL`, `TURN_USER`, `TURN_PASS` set (screen share + meetings work behind NATs)
- [ ] `CRON_SECRET` set + external cron job calling `/api/cron/scheduled-emails` every 5-10 min
- [ ] First signup is auto-promoted to admin (or seed the admin user via `/api/seed`)
- [ ] HTTPS termination configured (Caddy, nginx, Cloudflare, etc.) — required for WebRTC getUserMedia

---

## 8. Admin responsibilities (Super Admin role)

Once you've signed in as an admin:

- **Members tab** — promote/demote users, suspend/ban, search
- **API Tokens tab** — issue/revoke API tokens with quotas and scopes (these tokens power consumer translation; consumers never see this tab)
- **Plans tab** — create/edit subscription plans for B2C and B2B (audience field controls visibility)
- **Subscriptions tab** — change any user's plan (issues a prorated invoice), extend periods, cancel
- **B2B Orgs tab** — create organizations, assign owners, suspend orgs (cascades to canceling all their subscriptions)
- **System settings** (inside Members tab → gear icon, or via `/api/admin/settings`) — set OpenAI key, SMTP creds, TURN servers, default language, signup mode, maintenance mode

---

## 9. Architecture notes

- **Consumer vs Admin roles**: consumers see only Meetings, Mail, Settings. Admins see the full control panel. API tokens, billing, organizations — all admin-only.
- **Live on-call translation**: the meeting room's "Live translation" tab captures microphone audio via AudioWorklet (24kHz PCM16), streams it to OpenAI Realtime API over WebSocket, and plays back the translated audio in real time. Captions are also displayed and persisted to the transcript history.
- **WebRTC**: peer-to-peer mesh with server-relayed signaling via `/api/meetings/[id]/signal`. For >8 participants, consider switching to an SFU (LiveKit, mediasoup, Janus) — the current mesh is fine for small meetings.
- **Screen share**: uses `getDisplayMedia` with `contentHint: 'detail'` and `degradationPreference: 'maintain-resolution'` so text stays crisp even on poor networks. Bitrate is bumped to 4 Mbps; signaling poll is 400ms for low-latency ICE.

---

## 10. Troubleshooting

**Live translation shows "BASIC" badge instead of "REALTIME"**
→ OpenAI API key not configured. Set `OPENAI_API_KEY` in `.env` or via Admin Panel → System settings.

**WebSocket connection fails with 4401/4403**
→ OpenAI API key is invalid or expired. Regenerate at https://platform.openai.com/api-keys.

**Screen share is laggy / pixelated**
→ TURN server not configured. Set `TURN_URL`, `TURN_USER`, `TURN_PASS`. Also check that the sender's network isn't bandwidth-limited (the 4 Mbps cap may need lowering).

**Emails are saved in Sent but never delivered**
→ SMTP not configured. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` in `.env` or Admin Panel.

**Google OAuth redirects back without signing in**
→ Redirect URL mismatch. Ensure Supabase Dashboard has `https://YOUR_DOMAIN/api/auth/callback` listed, and Google Cloud Console has the same in Authorized redirect URIs.

**"Cannot find module '@prisma/client'"**
→ Run `bunx prisma generate`.

**Database is empty after restart**
→ You're using SQLite with `file:` URL — the file persists at the path. If you ran `prisma migrate reset`, the data was wiped. Re-seed with `curl -X POST http://localhost:3000/api/seed`.

---

For anything else, check the worklog at `/home/z/my-project/worklog.md` for a history of agent actions.
