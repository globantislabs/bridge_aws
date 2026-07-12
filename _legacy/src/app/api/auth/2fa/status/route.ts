import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

/**
 * GET /api/auth/2fa/status
 *
 * Returns whether the authenticated user has 2FA enabled (confirmed secret).
 * Used by the settings UI to render the right card state on mount.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const row = await db.twoFactorSecret.findUnique({ where: { userId: user.id } })
    return NextResponse.json({
      enabled: !!(row && row.confirmedAt),
      pending: !!(row && !row.confirmedAt),
    })
  } catch (e: any) {
    return NextResponse.json({ enabled: false, pending: false })
  }
}
