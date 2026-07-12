import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getClientIp } from '@/lib/crypto'

async function requireAdmin(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'admin') return null
  return user
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

/**
 * GET /api/admin/organizations
 *   Returns all organizations with member count, owner, plan.
 */
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''

  const where: any = {}
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { slug: { contains: search } },
      { domain: { contains: search } },
    ]
  }

  const orgs = await db.organization.findMany({
    where,
    include: {
      owner: { select: { id: true, email: true, name: true } },
      _count: { select: { members: true, subscriptions: true } },
      subscriptions: {
        where: { status: 'active' },
        include: { plan: true },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json({
    organizations: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      domain: o.domain,
      status: o.status,
      billingEmail: o.billingEmail,
      size: o.size,
      audience: o.audience,
      owner: o.owner,
      memberCount: o._count.members,
      plan: o.subscriptions[0]?.plan?.tier ?? 'free',
      createdAt: o.createdAt,
    })),
  })
}

/**
 * POST /api/admin/organizations
 *   Create a new B2B organization.
 *
 * Body:
 *   - name (required)
 *   - ownerId (required) — the user who will own the org
 *   - domain, billingEmail, size, audience
 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  if (!body.name || !body.ownerId) {
    return NextResponse.json(
      { error: 'name and ownerId are required' },
      { status: 400 }
    )
  }

  const owner = await db.user.findUnique({ where: { id: body.ownerId } })
  if (!owner) {
    return NextResponse.json({ error: 'Owner user not found' }, { status: 404 })
  }

  let slug = body.slug ? slugify(body.slug) : slugify(body.name)
  // Ensure slug uniqueness
  let suffix = 1
  let slugBase = slug
  while (await db.organization.findUnique({ where: { slug } })) {
    slug = `${slugBase}-${suffix++}`
  }

  try {
    const org = await db.organization.create({
      data: {
        name: body.name,
        slug,
        ownerId: body.ownerId,
        domain: body.domain || null,
        billingEmail: body.billingEmail || owner.email,
        size: body.size || '1-10',
        audience: body.audience || 'b2b',
        status: 'active',
      },
    })
    // Owner is automatically an admin member
    await db.organizationMember.create({
      data: {
        orgId: org.id,
        userId: body.ownerId,
        role: 'owner',
      },
    })
    await db.activityLog.create({
      data: {
        userId: user.id,
        action: 'admin.org.create',
        metaJson: JSON.stringify({ orgId: org.id, slug: org.slug, ownerId: body.ownerId }),
        ipAddress: getClientIp(req),
        severity: 'info',
      },
    })
    return NextResponse.json({ organization: org })
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Failed to create organization', detail: String(e?.message || e) },
      { status: 500 }
    )
  }
}
