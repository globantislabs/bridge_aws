import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getClientIp } from '@/lib/crypto'

async function requireAdmin(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'admin') return null
  return user
}

/**
 * PATCH /api/admin/subscriptions/[id]
 *
 * Body:
 *   - planId: change the plan (creates a prorated invoice record)
 *   - status: 'active' | 'canceled' | 'past_due' | 'trialing'
 *   - cancelAtPeriodEnd: boolean
 *   - interval: 'monthly' | 'yearly'
 *   - currentPeriodEnd: ISO date string (extend/shorten)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const sub = await db.subscription.findUnique({
    where: { id },
    include: { plan: true },
  })
  if (!sub) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
  }

  const data: any = {}
  if (body.status) data.status = body.status
  if (typeof body.cancelAtPeriodEnd === 'boolean') {
    data.cancelAtPeriodEnd = body.cancelAtPeriodEnd
  }
  if (body.interval) data.interval = body.interval
  if (body.currentPeriodEnd) {
    data.currentPeriodEnd = new Date(body.currentPeriodEnd)
  }

  // Plan change → issue a prorated invoice record
  if (body.planId && body.planId !== sub.planId) {
    const newPlan = await db.plan.findUnique({ where: { id: body.planId } })
    if (!newPlan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }
    data.planId = body.planId
    // Prorated invoice: difference in price (could be negative for downgrade)
    const daysLeft = Math.max(
      0,
      Math.ceil(
        (sub.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    )
    const daysTotal = Math.max(
      1,
      Math.ceil(
        (sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    )
    const oldPrice =
      sub.interval === 'yearly' ? sub.plan.priceYearly : sub.plan.priceMonthly
    const newPrice =
      sub.interval === 'yearly' ? newPlan.priceYearly : newPlan.priceMonthly
    const prorated = Math.round(((newPrice - oldPrice) * daysLeft) / daysTotal)

    if (prorated !== 0) {
      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`
      await db.invoice.create({
        data: {
          userId: sub.userId,
          orgId: sub.orgId,
          planId: newPlan.id,
          amount: Math.abs(prorated),
          currency: newPlan.currency,
          status: 'paid',
          number: invoiceNumber,
          periodStart: new Date(),
          periodEnd: sub.currentPeriodEnd,
        },
      })
    }
    // Reset period when changing plan
    data.currentPeriodStart = new Date()
    const intervalMs =
      sub.interval === 'yearly'
        ? 365 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000
    data.currentPeriodEnd = new Date(Date.now() + intervalMs)
  }

  const updated = await db.subscription.update({ where: { id }, data })

  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'admin.subscription.update',
      metaJson: JSON.stringify({
        subscriptionId: id,
        fields: Object.keys(data),
        oldPlan: sub.plan.tier,
        newPlan: body.planId ? 'changed' : 'unchanged',
      }),
      ipAddress: getClientIp(req),
      severity: 'warn',
    },
  })

  return NextResponse.json({ subscription: updated })
}

/** DELETE — cancel a subscription immediately. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params

  const updated = await db.subscription.update({
    where: { id },
    data: {
      status: 'canceled',
      cancelAtPeriodEnd: true,
    },
  })

  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'admin.subscription.cancel',
      metaJson: JSON.stringify({ subscriptionId: id }),
      ipAddress: getClientIp(req),
      severity: 'warn',
    },
  })

  return NextResponse.json({ subscription: updated })
}
