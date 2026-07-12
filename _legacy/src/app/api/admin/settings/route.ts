import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getClientIp } from '@/lib/crypto'

/** GET /api/admin/settings — list all system settings */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  const settings = await db.systemSetting.findMany()
  return NextResponse.json({
    settings: settings.reduce((acc, s) => {
      acc[s.key] = s.value
      return acc
    }, {} as Record<string, string>),
  })
}

/** POST /api/admin/settings — upsert a setting */
export async function POST(req: NextRequest) {
  const admin = await getSessionUser(req)
  if (!admin || admin.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  const body = await req.json()
  const { key, value } = body as { key: string; value: string }
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })
  const setting = await db.systemSetting.upsert({
    where: { key },
    create: { key, value: String(value) },
    update: { value: String(value) },
  })
  await db.activityLog.create({
    data: {
      userId: admin.id,
      action: 'admin.setting.update',
      metaJson: JSON.stringify({ key, value }),
      ipAddress: getClientIp(req),
      severity: 'info',
    },
  })
  return NextResponse.json({ setting })
}
