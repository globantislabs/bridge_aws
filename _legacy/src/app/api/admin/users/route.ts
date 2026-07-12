import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getClientIp } from '@/lib/crypto'

/** GET /api/admin/users — list users (paginated, filterable) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const status = searchParams.get('status')
  const role = searchParams.get('role')
  const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 500)
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0)

  let where: any = {}
  if (q) {
    where.OR = [
      { email: { contains: q } },
      { name: { contains: q } },
    ]
  }
  if (status) where.status = status
  if (role) where.role = role

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      include: {
        subscriptions: { include: { plan: true }, take: 1, orderBy: { createdAt: 'desc' } },
        apiTokens: { where: { revokedAt: null } },
        _count: { select: { emails: true, meetings: true, activityLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.user.count({ where }),
  ])

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      locale: u.locale,
      plan: u.subscriptions[0]?.plan?.tier ?? 'free',
      tokens: u.apiTokens.length,
      emailsCount: u._count.emails,
      meetingsCount: u._count.meetings,
      activityCount: u._count.activityLogs,
      avatarUrl: u.avatarUrl,
      createdAt: u.createdAt,
    })),
    total,
  })
}

/** PATCH /api/admin/users — update user role or status */
export async function PATCH(req: NextRequest) {
  const admin = await getSessionUser(req)
  if (!admin || admin.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  const body = await req.json()
  const { id, role, status, name, locale } = body as {
    id: string
    role?: string
    status?: string
    name?: string
    locale?: string
  }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (id === admin.id && role && role !== 'admin') {
    return NextResponse.json(
      { error: 'Cannot demote yourself' },
      { status: 400 }
    )
  }
  const data: any = {}
  if (role) data.role = role
  if (status) data.status = status
  if (name !== undefined) data.name = name
  if (locale !== undefined) data.locale = locale

  const updated = await db.user.update({ where: { id }, data })
  await db.activityLog.create({
    data: {
      userId: admin.id,
      action: 'admin.user.update',
      metaJson: JSON.stringify({ targetId: id, changes: data }),
      ipAddress: getClientIp(req),
      severity: 'warn',
    },
  })
  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      status: updated.status,
      locale: updated.locale,
      avatarUrl: updated.avatarUrl,
      createdAt: updated.createdAt,
    },
  })
}

/** DELETE /api/admin/users — permanently delete a user */
export async function DELETE(req: NextRequest) {
  const admin = await getSessionUser(req)
  if (!admin || admin.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (id === admin.id) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }
  await db.user.delete({ where: { id } })
  await db.activityLog.create({
    data: {
      userId: admin.id,
      action: 'admin.user.delete',
      metaJson: JSON.stringify({ targetId: id }),
      ipAddress: getClientIp(req),
      severity: 'error',
    },
  })
  return NextResponse.json({ ok: true })
}
