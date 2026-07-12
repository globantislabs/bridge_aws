import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getClientIp } from '@/lib/crypto'

/** Admin-only guard. */
async function requireAdmin(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'admin') return null
  return user
}

/**
 * GET /api/admin/plans
 *   Returns all plans (including inactive) for super-admin management.
 *
 * GET /api/admin/plans?audience=b2c
 *   Public-ish: returns active plans filtered by audience.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  const { searchParams } = new URL(req.url)
  const audience = searchParams.get('audience') // 'b2b' | 'b2c' | 'both' | null
  const adminView = user?.role === 'admin'

  const where: any = {}
  if (!adminView) where.isActive = true
  if (audience) {
    // 'both' plans always show; otherwise match audience OR 'both'
    where.OR = [{ audience }, { audience: 'both' }]
  }

  const plans = await db.plan.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
  })
  return NextResponse.json({ plans })
}

/**
 * POST /api/admin/plans  — create a new plan (admin only)
 *
 * Body:
 *   - name, tier (unique), priceMonthly, priceYearly
 *   - meetingMinutes, maxParticipants, translationLangs, apiTokens, storageGb
 *   - featuresCsv (comma-separated), audience, isFeatured, sortOrder
 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const required = ['name', 'tier', 'priceMonthly', 'priceYearly']
  for (const f of required) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      return NextResponse.json({ error: `Missing field: ${f}` }, { status: 400 })
    }
  }
  // Tier must be a slug-like string (lowercase, no spaces)
  if (!/^[a-z0-9-]+$/.test(body.tier)) {
    return NextResponse.json(
      { error: 'tier must be lowercase kebab-case (a-z, 0-9, dashes)' },
      { status: 400 }
    )
  }

  try {
    const plan = await db.plan.create({
      data: {
        name: body.name,
        tier: body.tier,
        priceMonthly: Number(body.priceMonthly),
        priceYearly: Number(body.priceYearly),
        currency: body.currency || 'usd',
        meetingMinutes: Number(body.meetingMinutes ?? 1000),
        maxParticipants: Number(body.maxParticipants ?? 50),
        translationLangs: Number(body.translationLangs ?? 20),
        apiTokens: Number(body.apiTokens ?? 5),
        storageGb: Number(body.storageGb ?? 5),
        featuresCsv: body.featuresCsv || '',
        audience: body.audience || 'both',
        isFeatured: !!body.isFeatured,
        sortOrder: Number(body.sortOrder ?? 0),
        isActive: body.isActive !== false,
      },
    })
    await db.activityLog.create({
      data: {
        userId: user.id,
        action: 'admin.plan.create',
        metaJson: JSON.stringify({ planId: plan.id, tier: plan.tier }),
        ipAddress: getClientIp(req),
        severity: 'info',
      },
    })
    return NextResponse.json({ plan })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { error: 'A plan with that tier already exists' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create plan', detail: String(e?.message || e) },
      { status: 500 }
    )
  }
}
