import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createHash } from 'crypto'
import { createSession } from '@/lib/session'
import { rateLimit } from '@/lib/crypto'

function hash(p: string) {
  return createHash('sha256').update(p).digest('hex')
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 signups per minute per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = rateLimit(`signup:${ip}`, 5)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many signups from this IP. Try again in ${rl.resetIn}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
      )
    }

    const body = await req.json().catch(() => ({} as any))
    const { email, password, name } = body as {
      email?: string
      password?: string
      name?: string
    }
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Wrap DB calls so a missing/mismatched schema returns a clear message
    // instead of an opaque 500.
    let existing
    try {
      existing = await db.user.findUnique({ where: { email: normalizedEmail } })
    } catch (dbErr: any) {
      console.error('[auth/signup] DB error:', dbErr?.message)
      return NextResponse.json(
        {
          error:
            'Database not initialized. Run: bunx prisma db push && bunx prisma generate, then restart the dev server.',
        },
        { status: 500 }
      )
    }
    if (existing) {
      return NextResponse.json(
        { error: 'This email is already registered. Try signing in instead.' },
        { status: 409 }
      )
    }

    // First user ever to sign up becomes the super-admin (bootstrap pattern).
    // Subsequent signups are regular users (consumers).
    let userCount = 0
    try {
      userCount = await db.user.count()
    } catch {
      // ignore — proceed as if first user
    }
    const isFirstUser = userCount === 0

    let user
    try {
      user = await db.user.create({
        data: {
          email: normalizedEmail,
          name: (name || normalizedEmail.split('@')[0]).trim(),
          passwordHash: hash(password),
          role:
            isFirstUser || normalizedEmail.endsWith('@admin.local')
              ? 'admin'
              : 'user',
          locale: 'en',
        },
      })
    } catch (createErr: any) {
      console.error('[auth/signup] create error:', createErr?.message)
      return NextResponse.json(
        { error: 'Could not create account. ' + (createErr?.message || '') },
        { status: 500 }
      )
    }

    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
    await createSession(user.id, req, res)
    return res
  } catch (e: any) {
    console.error('[auth/signup] unhandled error:', e)
    return NextResponse.json(
      { error: e?.message || 'Signup failed. Please try again.' },
      { status: 500 }
    )
  }
}
