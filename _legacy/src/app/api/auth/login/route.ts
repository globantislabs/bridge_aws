import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createHash, randomBytes } from 'crypto'
import { createSession, SESSION_COOKIE } from '@/lib/session'
import { authenticator } from 'otplib'
import { rateLimit } from '@/lib/crypto'

function hash(p: string) {
  return createHash('sha256').update(p).digest('hex')
}

/**
 * Built-in demo accounts. Auto-bootstrap on first login so the app works
 * out-of-the-box after `bun install && bun run dev` — no need to call
 * /api/seed.
 */
const BUILTIN_ACCOUNTS = [
  { email: 'demo@bridge.app', name: 'Alex Demo', password: 'demo1234', role: 'user' as const },
  { email: 'admin@bridge.app', name: 'Admin Root', password: 'admin1234', role: 'admin' as const },
]

async function ensureUserExists(email: string) {
  try {
    return await db.user.findUnique({ where: { email } })
  } catch {
    return null
  }
}

async function bootstrapBuiltinAccount(email: string) {
  const acc = BUILTIN_ACCOUNTS.find((a) => a.email === email)
  if (!acc) return null
  try {
    return await db.user.create({
      data: {
        email: acc.email,
        name: acc.name,
        passwordHash: hash(acc.password),
        role: acc.role,
        locale: 'en',
      },
    })
  } catch {
    try {
      return await db.user.findUnique({ where: { email: acc.email } })
    } catch {
      return null
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 attempts per 15 minutes per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = rateLimit(`login:${ip}`, 10)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${rl.resetIn}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
      )
    }

    const body = await req.json().catch(() => ({} as any))
    const { email, password } = body as { email?: string; password?: string }
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    let user
    try {
      user = await db.user.findUnique({ where: { email: normalizedEmail } })
    } catch (dbErr: any) {
      console.error('[auth/login] DB error on findUnique:', dbErr?.message)
      return NextResponse.json(
        {
          error:
            'Database not initialized. Run: bunx prisma db push && bunx prisma generate, then restart the dev server.',
        },
        { status: 500 }
      )
    }

    if (!user) {
      const isBuiltin = BUILTIN_ACCOUNTS.some((a) => a.email === normalizedEmail)
      if (isBuiltin) {
        user = await bootstrapBuiltinAccount(normalizedEmail)
      }
    }

    if (!user || !user.passwordHash || user.passwordHash !== hash(password)) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      )
    }

    if (user.status === 'suspended' || user.status === 'banned') {
      return NextResponse.json(
        { error: 'This account has been suspended. Contact your administrator.' },
        { status: 403 }
      )
    }

    // 2FA check: if user has a confirmed TOTP secret, return a challenge
    // instead of issuing a session. The client then POSTs to /api/auth/login/2fa
    // with the code.
    let twoFactor: Awaited<ReturnType<typeof db.twoFactorSecret.findUnique>> = null
    try {
      twoFactor = await db.twoFactorSecret.findUnique({ where: { userId: user.id } })
    } catch {
      // TwoFactorSecret table may not exist on legacy DBs — treat as no 2FA
    }
    if (twoFactor && twoFactor.confirmedAt) {
      // Issue a short-lived pre-auth token (5 min) that only allows verifying 2FA
      const preAuthToken = randomBytes(32).toString('hex')
      ;(globalThis as any).__preAuth =
        (globalThis as any).__preAuth || new Map()
      ;(globalThis as any).__preAuth.set(preAuthToken, {
        userId: user.id,
        expires: Date.now() + 5 * 60 * 1000,
      })
      const res = NextResponse.json({
        ok: true,
        twoFactorRequired: true,
        preAuthToken,
      })
      return res
    }

    // No 2FA — issue session
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    })
    await createSession(user.id, req, res)
    return res
  } catch (e: any) {
    console.error('[auth/login] unhandled error:', e)
    return NextResponse.json(
      { error: e?.message || 'Login failed. Please try again.' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/auth/login/status
 * Quick health check used by the auth modal.
 */
export async function GET() {
  try {
    const count = await db.user.count()
    return NextResponse.json({ ok: true, userCount: count })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'Database not initialized. Run: bunx prisma db push' },
      { status: 500 }
    )
  }
}
