import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getClientIp } from '@/lib/crypto'

/** POST /api/settings/preferences — upsert user preferences */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const allowed = [
    'theme', 'density', 'fontScale',
    'notifEmail', 'notifPush', 'notifMeeting', 'notifWeekly',
    'autoTranslate', 'preferredLangs', 'showCaptions', 'captionSize',
    'audioEcho', 'audioNoise', 'videoMirror', 'videoFps', 'videoQuality',
  ]
  const data: any = {}
  for (const k of allowed) {
    if (body[k] !== undefined) data[k] = body[k]
  }
  const prefs = await db.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  })
  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'settings.preferences.update',
      metaJson: JSON.stringify(Object.keys(data)),
      ipAddress: getClientIp(req),
      severity: 'info',
    },
  }).catch(() => {})
  return NextResponse.json({ preferences: prefs })
}
