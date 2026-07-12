import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getClientIp } from '@/lib/crypto'

/** GET /api/settings — full settings snapshot */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [u, prefs] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, email: true, name: true, avatarUrl: true, role: true,
        locale: true, status: true, title: true, company: true,
        timezone: true, bio: true, createdAt: true,
      },
    }),
    db.userPreference.findUnique({ where: { userId: user.id } }),
  ])
  if (!u) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    user: u,
    preferences: prefs ?? null,
  })
}

/** POST /api/settings/profile — update profile fields */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, email, bio, title, company, timezone, locale } = body as {
    name?: string
    email?: string
    bio?: string
    title?: string
    company?: string
    timezone?: string
    locale?: string
  }
  const data: any = {}
  if (name !== undefined) data.name = name
  if (bio !== undefined) data.bio = bio
  if (title !== undefined) data.title = title
  if (company !== undefined) data.company = company
  if (timezone !== undefined) data.timezone = timezone
  if (locale !== undefined) data.locale = locale
  if (email !== undefined && email !== user.email) {
    // Check if email already taken
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    data.email = email
  }
  const updated = await db.user.update({ where: { id: user.id }, data })
  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'settings.profile.update',
      metaJson: JSON.stringify(Object.keys(data)),
      ipAddress: getClientIp(req),
      severity: 'info',
    },
  }).catch(() => {})
  return NextResponse.json({
    user: {
      id: updated.id, email: updated.email, name: updated.name,
      avatarUrl: updated.avatarUrl, role: updated.role, locale: updated.locale,
      title: updated.title, company: updated.company, timezone: updated.timezone,
      bio: updated.bio,
    },
  })
}
