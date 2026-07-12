import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getClientIp } from '@/lib/crypto'

async function requireAdmin(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'admin') return null
  return user
}

/** GET /api/admin/plans/[id] — single plan (admin only). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params
  const plan = await db.plan.findUnique({ where: { id } })
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ plan })
}

/**
 * PATCH /api/admin/plans/[id] — update plan fields.
 * Body may contain any subset of plan fields.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const data: any = {}
  for (const k of [
    'name', 'tier', 'currency', 'featuresCsv', 'audience',
  ]) {
    if (body[k] !== undefined) data[k] = body[k]
  }
  for (const k of [
    'priceMonthly', 'priceYearly', 'meetingMinutes', 'maxParticipants',
    'translationLangs', 'apiTokens', 'storageGb', 'sortOrder',
  ]) {
    if (body[k] !== undefined) data[k] = Number(body[k])
  }
  for (const k of ['isActive', 'isFeatured']) {
    if (body[k] !== undefined) data[k] = !!body[k]
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    const plan = await db.plan.update({ where: { id }, data })
    await db.activityLog.create({
      data: {
        userId: user.id,
        action: 'admin.plan.update',
        metaJson: JSON.stringify({ planId: id, fields: Object.keys(data) }),
        ipAddress: getClientIp(req),
        severity: 'info',
      },
    })
    return NextResponse.json({ plan })
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Failed to update plan', detail: String(e?.message || e) },
      { status: 500 }
    )
  }
}

/** DELETE /api/admin/plans/[id] — deactivate (soft delete) the plan. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params

  // Check if any subscriptions are still using this plan
  const activeCount = await db.subscription.count({
    where: { planId: id, status: 'active' },
  })
  if (activeCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: ${activeCount} active subscription(s) are on this plan. Deactivate it instead.`,
      },
      { status: 409 }
    )
  }

  // Hard-delete if no active subs reference it
  try {
    await db.plan.delete({ where: { id } })
    await db.activityLog.create({
      data: {
        userId: user.id,
        action: 'admin.plan.delete',
        metaJson: JSON.stringify({ planId: id }),
        ipAddress: getClientIp(req),
        severity: 'warn',
      },
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Failed to delete plan', detail: String(e?.message || e) },
      { status: 500 }
    )
  }
}
