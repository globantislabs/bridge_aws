import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

/** GET — recent reactions (for live overlay) */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const since = new URL(req.url).searchParams.get('since')
  const where: any = { meetingId: id }
  if (since) where.createdAt = { gt: new Date(since) }
  const reactions = await db.meetingReaction.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
  return NextResponse.json({ reactions })
}

/** POST — add a reaction */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const meeting = await db.meeting.findUnique({ where: { id } })
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!meeting.allowReactions) {
    return NextResponse.json({ error: 'Reactions disabled' }, { status: 403 })
  }
  const body = await req.json()
  const { emoji } = body as { emoji: string }
  if (!emoji || emoji.length > 8) {
    return NextResponse.json({ error: 'invalid emoji' }, { status: 400 })
  }
  const reaction = await db.meetingReaction.create({
    data: {
      meetingId: id,
      userId: user.id,
      displayName: user.name,
      emoji,
    },
  })
  return NextResponse.json({ reaction })
}
