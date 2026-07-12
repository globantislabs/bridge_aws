import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { generateApiToken, getClientIp, rateLimit } from '@/lib/crypto'

const ALL_SCOPES = [
  { key: 'meetings:read', label: 'Read meetings' },
  { key: 'meetings:write', label: 'Create/update meetings' },
  { key: 'transcript:read', label: 'Read transcripts' },
  { key: 'transcript:write', label: 'Write transcripts' },
  { key: 'translate:use', label: 'Use translation API' },
  { key: 'emails:read', label: 'Read emails' },
  { key: 'emails:write', label: 'Send emails' },
  { key: 'tokens:read', label: 'List tokens' },
  { key: 'billing:read', label: 'Read billing' },
]

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tokens = await db.apiToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({
    tokens: tokens.map((t) => ({
      id: t.id,
      name: t.name,
      tokenPrefix: t.tokenPrefix,
      scopes: t.scopesCsv.split(',').filter(Boolean),
      quotaMinutes: t.quotaMinutes,
      usedMinutes: t.usedMinutes,
      requestCount: t.requestCount,
      rateLimitPerMin: t.rateLimitPerMin,
      lastUsedAt: t.lastUsedAt,
      lastUsedIp: t.lastUsedIp,
      expiresAt: t.expiresAt,
      revokedAt: t.revokedAt,
      createdAt: t.createdAt,
    })),
    availableScopes: ALL_SCOPES,
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Rate limit token creation to 10 per hour per user
  const rl = rateLimit(`token-create:${user.id}`, 10)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many tokens created recently. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
    )
  }
  const body = await req.json()
  const { name, scopes, quotaMinutes, expiresAt, rateLimitPerMin } = body as {
    name: string
    scopes?: string[]
    quotaMinutes?: number
    expiresAt?: string
    rateLimitPerMin?: number
  }
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  // Validate scopes
  const validScopes = (scopes ?? ['meetings:read']).filter((s) =>
    ALL_SCOPES.some((sc) => sc.key === s)
  )
  if (validScopes.length === 0) {
    return NextResponse.json({ error: 'at least one scope required' }, { status: 400 })
  }
  // Enforce max token count per user (e.g., 25)
  const count = await db.apiToken.count({ where: { userId: user.id, revokedAt: null } })
  if (count >= 25) {
    return NextResponse.json(
      { error: 'Token limit reached (25). Revoke unused tokens first.' },
      { status: 403 }
    )
  }
  const { raw, prefix, hash } = generateApiToken()
  const token = await db.apiToken.create({
    data: {
      userId: user.id,
      name,
      tokenPrefix: prefix,
      keyHash: hash,
      scopesCsv: validScopes.join(','),
      quotaMinutes: quotaMinutes ?? 1000,
      rateLimitPerMin: rateLimitPerMin ?? 60,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  })
  // Audit
  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'token.create',
      metaJson: JSON.stringify({ name, prefix, scopes: validScopes }),
      ipAddress: getClientIp(req),
      severity: 'info',
    },
  }).catch(() => {})
  return NextResponse.json({
    token: {
      id: token.id,
      name: token.name,
      fullKey: raw, // ONLY returned at creation
      tokenPrefix: token.tokenPrefix,
      scopes: token.scopesCsv.split(',').filter(Boolean),
      quotaMinutes: token.quotaMinutes,
      rateLimitPerMin: token.rateLimitPerMin,
      createdAt: token.createdAt,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id, name, scopes, quotaMinutes, rateLimitPerMin } = body as {
    id: string
    name?: string
    scopes?: string[]
    quotaMinutes?: number
    rateLimitPerMin?: number
  }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const data: any = {}
  if (name !== undefined) data.name = name
  if (scopes !== undefined) {
    const valid = scopes.filter((s) => ALL_SCOPES.some((sc) => sc.key === s))
    data.scopesCsv = valid.join(',')
  }
  if (quotaMinutes !== undefined) data.quotaMinutes = quotaMinutes
  if (rateLimitPerMin !== undefined) data.rateLimitPerMin = rateLimitPerMin
  const token = await db.apiToken.update({ where: { id, userId: user.id }, data })
  return NextResponse.json({ token })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await db.apiToken.update({
    where: { id, userId: user.id },
    data: { revokedAt: new Date() },
  })
  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'token.revoke',
      metaJson: JSON.stringify({ id }),
      ipAddress: getClientIp(req),
      severity: 'warn',
    },
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}
