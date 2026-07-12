import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/health
 *
 * Liveness + readiness probe for AWS App Runner / ECS / Kubernetes.
 *
 * Returns 200 if the app is ready to serve traffic, 503 otherwise.
 * Checks:
 *   - DB connection (can run a trivial query)
 *   - Required env vars are present (DATABASE_URL)
 *   - Session table exists (proxy for "migrations have been run")
 *
 * No auth required. Safe to expose publicly.
 */
export async function GET() {
  const checks: { name: string; ok: boolean; ms?: number; error?: string }[] = []

  // 1. DB ping
  const dbStart = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    checks.push({ name: 'database', ok: true, ms: Date.now() - dbStart })
  } catch (e: any) {
    checks.push({
      name: 'database',
      ok: false,
      ms: Date.now() - dbStart,
      error: e?.message?.slice(0, 200),
    })
  }

  // 2. Session table exists (proxy for "migrations applied")
  try {
    await db.session.count()
    checks.push({ name: 'sessions_table', ok: true })
  } catch (e: any) {
    checks.push({
      name: 'sessions_table',
      ok: false,
      error: 'Run: bunx prisma db push',
    })
  }

  // 3. TwoFactorSecret table exists
  try {
    await db.twoFactorSecret.count()
    checks.push({ name: 'twofactor_table', ok: true })
  } catch {
    checks.push({
      name: 'twofactor_table',
      ok: false,
      error: 'Run: bunx prisma db push',
    })
  }

  // 4. Required env vars
  const requiredEnv = ['DATABASE_URL']
  const missing = requiredEnv.filter((k) => !process.env[k])
  checks.push({
    name: 'env_vars',
    ok: missing.length === 0,
    error: missing.length ? `Missing: ${missing.join(', ')}` : undefined,
  })

  const allOk = checks.every((c) => c.ok)
  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version || '0.1.0',
      node: process.version,
      checks,
    },
    { status: allOk ? 200 : 503 }
  )
}
