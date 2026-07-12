import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { createHash } from 'crypto'

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/**
 * POST /api/auth/2fa/disable
 * Body: { password }
 *
 * Disables 2FA for the authenticated user. Requires the account password
 * (not just the session cookie) as a re-confirmation step. Deletes the
 * TwoFactorSecret row entirely so setup can be redone.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const { password } = body as { password?: string }
    if (!password) {
      return NextResponse.json({ error: 'password required to disable 2FA' }, { status: 400 })
    }

    const dbUser = await db.user.findUnique({ where: { id: user.id } })
    if (!dbUser || !dbUser.passwordHash) {
      return NextResponse.json({ error: 'Account has no password' }, { status: 400 })
    }
    if (dbUser.passwordHash !== hash(password)) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }

    await db.twoFactorSecret.deleteMany({ where: { userId: user.id } })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[auth/2fa/disable] error:', e)
    return NextResponse.json(
      { error: e?.message || 'Failed to disable 2FA' },
      { status: 500 }
    )
  }
}
