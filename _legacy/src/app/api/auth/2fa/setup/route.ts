import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { createHash, randomBytes } from 'crypto'

function obfuscate(s: string): string {
  return Buffer.from(s.split('').map((c) => String.fromCharCode(c.charCodeAt(0) ^ 0x5a)).join('')).toString('base64')
}
function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/**
 * POST /api/auth/2fa/setup
 *
 * Generates a new TOTP secret for the authenticated user, stores it in
 * TwoFactorSecret (unconfirmed — `confirmedAt` is null), and returns a
 * QR code data URL + secret string so the user can add it to their
 * authenticator app. The user then calls /verify with a 6-digit code
 * to confirm.
 *
 * If the user already has a confirmed secret, returns 409 (must disable first).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await db.twoFactorSecret.findUnique({ where: { userId: user.id } })
    if (existing && existing.confirmedAt) {
      return NextResponse.json(
        { error: '2FA is already enabled. Disable it first to reconfigure.' },
        { status: 409 }
      )
    }

    const secret = authenticator.generateSecret()
    const otpauth = authenticator.keyuri(user.email, 'Bridge', secret)
    const qrDataUrl = await QRCode.toDataURL(otpauth, { width: 240, margin: 1 })

    // Generate 8 single-use backup codes
    const plainBackupCodes = Array.from({ length: 8 }, () =>
      randomBytes(5).toString('hex').toUpperCase().slice(0, 10)
    )
    const hashedBackupCodes = plainBackupCodes.map(hash)

    // Upsert the secret (unconfirmed)
    await db.twoFactorSecret.upsert({
      where: { userId: user.id },
      update: {
        secretEnc: obfuscate(secret),
        backupCodes: JSON.stringify(hashedBackupCodes),
        confirmedAt: null,
      },
      create: {
        userId: user.id,
        secretEnc: obfuscate(secret),
        backupCodes: JSON.stringify(hashedBackupCodes),
      },
    })

    return NextResponse.json({
      qr: qrDataUrl,
      secret, // shown as text fallback in case QR doesn't scan
      backupCodes: plainBackupCodes, // shown ONCE here, never again
    })
  } catch (e: any) {
    console.error('[auth/2fa/setup] error:', e)
    return NextResponse.json(
      { error: e?.message || 'Failed to start 2FA setup' },
      { status: 500 }
    )
  }
}
