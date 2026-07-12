import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createHash } from 'crypto'
import { createSession } from '@/lib/session'
import { authenticator } from 'otplib'

function hash(p: string) {
  return createHash('sha256').update(p).digest('hex')
}

function deobfuscate(enc: string): string {
  return Buffer.from(enc, 'base64').toString('utf8')
    .split('').map((c) => String.fromCharCode(c.charCodeAt(0) ^ 0x5a)).join('')
}

/**
 * POST /api/auth/login/2fa
 * Body: { preAuthToken, code, backupCode? }
 *
 * Completes login after the user has typed their password and we detected
 * they have 2FA enabled. The `preAuthToken` is the short-lived token issued
 * by /api/auth/login. `code` is a 6-digit TOTP, or `backupCode` is one of
 * the 8 single-use backup codes shown at setup time.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const { preAuthToken, code, backupCode } = body as {
      preAuthToken?: string
      code?: string
      backupCode?: string
    }
    if (!preAuthToken) {
      return NextResponse.json({ error: 'preAuthToken required' }, { status: 400 })
    }

    const store = (globalThis as any).__preAuth as
      | Map<string, { userId: string; expires: number }>
      | undefined
    const preAuth = store?.get(preAuthToken)
    if (!preAuth) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }
    if (Date.now() > preAuth.expires) {
      store?.delete(preAuthToken)
      return NextResponse.json({ error: 'Token expired — please log in again' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { id: preAuth.userId },
      include: { twoFactor: true },
    })
    if (!user || !user.twoFactor || !user.twoFactor.confirmedAt) {
      return NextResponse.json({ error: '2FA not enabled for this account' }, { status: 400 })
    }

    const secret = deobfuscate(user.twoFactor.secretEnc)

    // Try TOTP code first
    if (code) {
      const ok = authenticator.verify({ token: code.trim(), secret })
      if (!ok) {
        return NextResponse.json({ error: 'Invalid 6-digit code' }, { status: 401 })
      }
    } else if (backupCode) {
      // Backup codes are stored as a JSON array of sha256 hashes
      const codes: string[] = JSON.parse(user.twoFactor.backupCodes || '[]')
      const candidate = hash(backupCode.trim())
      const idx = codes.indexOf(candidate)
      if (idx === -1) {
        return NextResponse.json({ error: 'Invalid backup code' }, { status: 401 })
      }
      // Single-use: remove it
      codes.splice(idx, 1)
      await db.twoFactorSecret.update({
        where: { userId: user.id },
        data: { backupCodes: JSON.stringify(codes) },
      })
    } else {
      return NextResponse.json({ error: 'code or backupCode required' }, { status: 400 })
    }

    // Success — consume preAuth token and issue real session
    store?.delete(preAuthToken)

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
    console.error('[auth/login/2fa] error:', e)
    return NextResponse.json(
      { error: e?.message || '2FA verification failed' },
      { status: 500 }
    )
  }
}
