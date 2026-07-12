import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

async function requireAdmin(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'admin') return null
  return user
}

/**
 * GET /api/admin/subscriptions
 *   Returns all subscriptions across the platform with user, org, and plan.
 *
 * Query params:
 *   - status: 'active' | 'canceled' | 'past_due' | 'trialing'
 *   - search: filter by user email or org name
 */
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const search = searchParams.get('search') || ''

  const where: any = {}
  if (status) where.status = status
  if (search) {
    where.OR = [
      { user: { email: { contains: search } } },
      { user: { name: { contains: search } } },
      { org: { name: { contains: search } } },
    ]
  }

  const subs = await db.subscription.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, name: true, avatarUrl: true } },
      org: { select: { id: true, name: true, slug: true } },
      plan: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json({
    subscriptions: subs.map((s) => ({
      id: s.id,
      status: s.status,
      interval: s.interval,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      createdAt: s.createdAt,
      user: s.user,
      org: s.org,
      plan: s.plan,
    })),
  })
}
