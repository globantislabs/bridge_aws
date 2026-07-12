import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getClientIp } from '@/lib/crypto'

async function requireAdmin(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'admin') return null
  return user
}

/** GET /api/admin/organizations/[id] — full org detail with members + subs. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params
  const org = await db.organization.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, email: true, name: true } },
      members: {
        include: {
          user: { select: { id: true, email: true, name: true, avatarUrl: true } },
        },
        orderBy: { joinedAt: 'asc' },
      },
      subscriptions: {
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      },
      invoices: {
        orderBy: { issuedAt: 'desc' },
        take: 50,
      },
    },
  })
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ organization: org })
}

/** PATCH — update name, domain, billingEmail, size, status, audience. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const data: any = {}
  for (const k of ['name', 'domain', 'billingEmail', 'size', 'audience', 'status']) {
    if (body[k] !== undefined) data[k] = body[k]
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const updated = await db.organization.update({ where: { id }, data })
  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'admin.org.update',
      metaJson: JSON.stringify({ orgId: id, fields: Object.keys(data) }),
      ipAddress: getClientIp(req),
      severity: 'info',
    },
  })
  return NextResponse.json({ organization: updated })
}

/** DELETE — suspend the org (does NOT delete; preserves data). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params

  const updated = await db.organization.update({
    where: { id },
    data: { status: 'suspended' },
  })

  // Cancel all active subscriptions
  await db.subscription.updateMany({
    where: { orgId: id, status: 'active' },
    data: { status: 'canceled', cancelAtPeriodEnd: true },
  })

  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'admin.org.suspend',
      metaJson: JSON.stringify({ orgId: id }),
      ipAddress: getClientIp(req),
      severity: 'warn',
    },
  })
  return NextResponse.json({ organization: updated })
}
