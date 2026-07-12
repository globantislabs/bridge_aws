import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

/** GET /api/admin/audit — filter & paginate audit log */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const severity = searchParams.get('severity')
  const userId = searchParams.get('userId')
  const q = searchParams.get('q')
  const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 500)
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0)

  const where: any = {}
  if (action) where.action = { contains: action }
  if (severity) where.severity = severity
  if (userId) where.userId = userId
  if (q) {
    where.OR = [
      { action: { contains: q } },
      { metaJson: { contains: q } },
      { ipAddress: { contains: q } },
    ]
  }

  const [logs, total] = await Promise.all([
    db.activityLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.activityLog.count({ where }),
  ])

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      meta: (() => { try { return JSON.parse(l.metaJson) } catch { return {} } })(),
      ipAddress: l.ipAddress,
      severity: l.severity,
      user: l.user,
      createdAt: l.createdAt,
    })),
    total,
  })
}
