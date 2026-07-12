import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateApiToken, hasScope, recordTokenUsage, enforceRateLimit } from '@/lib/api-auth'

/** GET /api/v1/meetings — list user's meetings (token-protected) */
export async function GET(req: NextRequest) {
  const token = await validateApiToken(req)
  if (!token) {
    return NextResponse.json(
      { error: 'Invalid or expired API token' },
      { status: 401 }
    )
  }
  if (!hasScope(token, 'meetings:read')) {
    return NextResponse.json(
      { error: 'Insufficient scope (meetings:read required)' },
      { status: 403 }
    )
  }
  const rl = await enforceRateLimit(token)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limited', resetIn: rl.resetIn },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
    )
  }
  await recordTokenUsage(token, req)
  const meetings = await db.meeting.findMany({
    where: { hostId: token.userId },
    orderBy: { startAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      startAt: true,
      joinCode: true,
      transcriptLang: true,
      targetLangs: true,
      _count: { select: { participants: true } },
    },
  })
  return NextResponse.json({
    meetings,
    rateLimit: {
      limit: token.rateLimitPerMin,
      remaining: rl.remaining,
      resetIn: rl.resetIn,
    },
  })
}

export async function POST(req: NextRequest) {
  const token = await validateApiToken(req)
  if (!token) {
    return NextResponse.json(
      { error: 'Invalid or expired API token' },
      { status: 401 }
    )
  }
  if (!hasScope(token, 'meetings:write')) {
    return NextResponse.json(
      { error: 'Insufficient scope (meetings:write required)' },
      { status: 403 }
    )
  }
  const rl = await enforceRateLimit(token)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limited' },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
    )
  }
  await recordTokenUsage(token, req)
  const body = await req.json()
  const { title, description, startAt, transcriptLang, targetLangs } = body as {
    title: string
    description?: string
    startAt?: string
    transcriptLang?: string
    targetLangs?: string
  }
  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }
  const joinCode =
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  const meeting = await db.meeting.create({
    data: {
      title,
      description: description || '',
      hostId: token.userId,
      status: 'scheduled',
      startAt: startAt ? new Date(startAt) : new Date(),
      joinCode,
      transcriptLang: transcriptLang || 'en',
      targetLangs: targetLangs || 'en,es,fr,de,ja,zh,hi',
    },
  })
  return NextResponse.json({ meeting })
}
