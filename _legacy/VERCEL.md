# Deploying Bridge to Vercel + Supabase (Auto-Deploy Flow)

Push to GitHub → Vercel auto-builds → DB schema auto-syncs → app live.
No manual `prisma db push` needed — Vercel runs it as part of every build.

---

## Step 1 — Set environment variables in Vercel

Go to: **Vercel → your project → Settings → Environment Variables**

Add these (apply to Production + Preview + Development):

| Name | Value |
|------|-------|
| `DATABASE_URL` | `postgresql://postgres.eiiqfbrklcnokzuyfijr:Credora2026@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres` |
| `DIRECT_URL` | `postgresql://postgres:Credora2026@db.eiiqfbrklcnokzuyfijr.supabase.co:5432/postgres` |
| `AUTH_SECRET` | (any random 32+ char string — generate at https://generate-secret.now.sh) |
| `CRON_SECRET` | (any different random string) |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` (replace with your real Vercel URL) |
| `NODE_ENV` | `production` |
| `OPENAI_API_KEY` | (your `sk-...` key — optional, can set via admin panel later) |

**Why both URLs?**
- `DATABASE_URL` (pooler) → runtime queries (IPv4, connection-pooled, fast)
- `DIRECT_URL` (direct) → `prisma db push` runs DDL through this (pooler blocks DDL)

---

## Step 2 — Connect GitHub repo to Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repo (`globantislabs/bridge`)
3. Vercel auto-detects Next.js — leave Framework Preset as "Next.js"
4. Build Command: leave as default (Vercel uses `vercel-build` script automatically)
5. Install Command: leave as default (`npm install`)
6. Click **Deploy**

---

## Step 3 — Push to GitHub → Vercel auto-deploys

```bash
git add .
git commit -m "deploy"
git push origin main
```

Vercel will now:
1. Run `npm install` (installs pinned Prisma v6.19.2 + all deps)
2. Run `postinstall` script → `prisma generate` (generates Prisma client)
3. Run `vercel-build` script → `prisma generate && prisma db push --accept-data-loss && next build`
   - `prisma generate` — regenerates client (safety)
   - `prisma db push` — syncs schema to Supabase (creates/updates tables automatically)
   - `next build` — compiles the Next.js app
4. Deploy serverless functions for each API route

**Build time:** ~2-3 minutes. Watch the build logs — you should see:
- "Generated Prisma Client (v6.19.2)"
- "Your database is now in sync with your Prisma schema"
- "Compiled successfully"

---

## Step 4 — Verify

Visit your Vercel URL:
- `https://your-app.vercel.app/api/health` → `{"ok":true,"database":"connected"}`
- `https://your-app.vercel.app/` → landing page renders
- Sign up at `/signup` → first user becomes super-admin automatically

---

## Local development

```bash
# Install deps (pins Prisma to v6 — do NOT use bunx prisma)
npm install

# Generate Prisma client
npx prisma generate

# (Optional) Push schema to Supabase manually — Vercel does this on every deploy
npx prisma db push

# Run dev server
npm run dev
```

> **CRITICAL:** Always use `npx prisma ...`, NEVER `bunx prisma ...`.
> `bunx` fetches the latest Prisma (v7) which removed `url`/`directUrl` from
> `schema.prisma` and throws `P1012: The datasource property 'url' is no longer supported`.

---

## How auto DB sync works

The `vercel-build` script in `package.json` is:
```
prisma generate && prisma db push --accept-data-loss && next build
```

- `prisma db push` is **idempotent** — if the schema hasn't changed, it's a no-op (takes ~1 second).
- If you add a new model to `prisma/schema.prisma`, just push to GitHub — Vercel will create the table automatically on the next deploy.
- `--accept-data-loss` is needed because `db push` can drop columns when you rename/remove fields. For production apps with real data, use `prisma migrate` instead. For dev/early-stage, `db push` is fine.

---

## Troubleshooting

### "Database not initialized" on signup

**Cause:** Prisma client not generated, OR tables not created.

**Fix:** Check Vercel build logs — you should see "Generated Prisma Client" and "Your database is now in sync". If not:
1. Verify `DATABASE_URL` and `DIRECT_URL` are set in Vercel env vars.
2. Verify `DIRECT_URL` points to the DIRECT connection (`db.xxx.supabase.co`), not the pooler.
3. Trigger a redeploy: Vercel → Deployments → click the latest → "Redeploy".

### "P1012: The datasource property 'url' is no longer supported"

**Cause:** Prisma v7 got installed instead of v6.

**Fix:**
1. Check `package.json` — `prisma` and `@prisma/client` must be pinned to `6.19.2` (no `^`).
2. Delete `node_modules` and `package-lock.json`, run `npm install` fresh.
3. Use `npx prisma ...` locally, never `bunx prisma ...`.

### "Can't reach database server" in Vercel build

**Cause:** Vercel can't reach Supabase (rare — Vercel has good connectivity).

**Fix:**
1. Check if your Supabase project is paused (free tier auto-pauses after 7 days of inactivity). Wake it up in the Supabase dashboard.
2. Verify the pooler URL region matches your Supabase project region.
3. If using IPv6-only direct URL, switch `DATABASE_URL` to the pooler (IPv4).

### Build succeeds but signup still 500s

**Cause:** Tables exist but Prisma client isn't bundled into the serverless function.

**Fix:** Verify `next.config.ts` has `serverExternalPackages: ["@prisma/client"]`. This is already set in the project — don't remove it.

### WebRTC meetings slow on Vercel

**Cause:** Vercel serverless functions have a 10s timeout on Hobby plan.

**Fix:** The signal polling uses 5s intervals to stay under this. For 50+ participant meetings, upgrade to Vercel Pro (60s timeout) or self-host on Railway/Render/Fly.io (see `DEPLOY.md`).

---

## Vercel env vars checklist

Before your first deploy, make sure ALL of these are set:

- [ ] `DATABASE_URL` (pooler URL — `aws-X-region.pooler.supabase.com`)
- [ ] `DIRECT_URL` (direct URL — `db.xxx.supabase.co`)
- [ ] `AUTH_SECRET` (random 32+ char string)
- [ ] `CRON_SECRET` (different random string)
- [ ] `NEXT_PUBLIC_APP_URL` (your Vercel URL)
- [ ] `NODE_ENV` = `production`
- [ ] `OPENAI_API_KEY` (optional — can set via admin panel later)

That's it. Push to GitHub → Vercel does the rest.
