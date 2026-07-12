import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { createHash } from 'crypto'
import { getClientIp } from '@/lib/crypto'

function hash(p: string) {
  return createHash('sha256').update(p).digest('hex')
}

/** POST /api/settings/security — change password */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { currentPassword, newPassword } = body as {
    currentPassword?: string
    newPassword?: string
  }
  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'currentPassword and newPassword required' },
      { status: 400 }
    )
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters' },
      { status: 400 }
    )
  }
  const u = await db.user.findUnique({ where: { id: user.id } })
  if (!u || !u.passwordHash) {
    return NextResponse.json({ error: 'No password set' }, { status: 400 })
  }
  if (u.passwordHash !== hash(currentPassword)) {
    return NextResponse.json({ error: 'Current password incorrect' }, { status: 403 })
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: hash(newPassword) },
  })
  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'settings.password.change',
      metaJson: '{}',
      ipAddress: getClientIp(req),
      severity: 'warn',
    },
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}
