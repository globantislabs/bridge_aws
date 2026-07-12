import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view') || 'overview'

    if (view === 'users') {
      const users = await db.user.findMany({
        include: {
          subscriptions: { include: { plan: true }, take: 1, orderBy: { createdAt: 'desc' } },
          apiTokens: { where: { revokedAt: null } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return NextResponse.json({
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          plan: u.subscriptions[0]?.plan?.tier ?? 'free',
          tokens: u.apiTokens.length,
          createdAt: u.createdAt,
        })),
      })
    }

    // overview
    const totalUsers = await db.user.count()
    const totalMeetings = await db.meeting.count()
    const totalEmails = await db.email.count()
    const totalTokens = await db.apiToken.count({ where: { revokedAt: null } })
    const totalInvoices = await db.invoice.count()
    const activeSubs = await db.subscription.count({ where: { status: 'active' } })
    const proSubs = await db.subscription.count({
      where: { status: 'active', plan: { tier: 'pro' } },
    })
    const entSubs = await db.subscription.count({
      where: { status: 'active', plan: { tier: 'enterprise' } },
    })
    const b2bSubs = await db.subscription.count({
      where: { status: 'active', orgId: { not: null } },
    })
    const b2cSubs = await db.subscription.count({
      where: { status: 'active', orgId: null },
    })
    const totalOrgs = await db.organization.count()
    const activeOrgs = await db.organization.count({ where: { status: 'active' } })
    const totalPlans = await db.plan.count()
    const mrr = await db.invoice.aggregate({
      where: { status: 'paid' },
      _sum: { amount: true },
    })
    // Activity over last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentActivity = await db.activityLog.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: true },
    })
    // Group activity by day
    const dayMap = new Map<string, number>()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      dayMap.set(key, 0)
    }
    const allActivity = await db.activityLog.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    })
    for (const a of allActivity) {
      const key = a.createdAt.toISOString().slice(0, 10)
      if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + 1)
    }
    const activitySeries = Array.from(dayMap.entries()).map(([date, count]) => ({
      date,
      count,
    }))

    return NextResponse.json({
      overview: {
        totalUsers,
        totalMeetings,
        totalEmails,
        totalTokens,
        totalInvoices,
        activeSubs,
        proSubs,
        entSubs,
        b2bSubs,
        b2cSubs,
        totalOrgs,
        activeOrgs,
        totalPlans,
        mrr: mrr._sum.amount ?? 0,
      },
      activitySeries,
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        action: a.action,
        user: a.user?.name ?? 'system',
        ipAddress: a.ipAddress,
        createdAt: a.createdAt,
      })),
    })
  } catch (err: any) {
    console.error('[/api/admin] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
