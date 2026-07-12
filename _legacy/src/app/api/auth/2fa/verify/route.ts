import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { authenticator } from 'otplib'

function deobfuscate(enc: string): string {
  return Buffer.from(enc, 'base64').toString('utf8')
    .split('').map((c) => String.fromCharCode(c.charCodeAt(0) ^ 0x5a)).join('')
}

/**
 * POST /api/auth/2fa/verify
 * Body: { code }
 *
 * Confirms 2FA setup by verifying the user's first TOTP code. Sets
 * `confirmedAt` to now, after which 2FA is enforced on every login.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const { code } = body as { code?: string }
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

    const row = await db.twoFactorSecret.findUnique({ where: { userId: user.id } })
    if (!row) {
      return NextResponse.json({ error: 'No 2FA setup in progress. Call /setup first.' }, { status: 400 })
    }
    if (row.confirmedAt) {
      return NextResponse.json({ error: '2FA already enabled' }, { status: 400 })
    }

    const secret = deobfuscate(row.secretEnc)
    const ok = authenticator.verify({ token: code.trim(), secret })
    if (!ok) {
      return NextResponse.json({ error: 'Invalid 6-digit code' }, { status: 401 })
    }

    await db.twoFactorSecret.update({
      where: { userId: user.id },
      data: { confirmedAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[auth/2fa/verify] error:', e)
    return NextResponse.json(
      { error: e?.message || 'Failed to verify 2FA' },
      { status: 500 }
    )
  }
}
