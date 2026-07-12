import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

/** GET — list polls for a meeting */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const polls = await db.meetingPoll.findMany({
    where: { meetingId: id },
    include: { votes: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ polls })
}

/** POST — create a new poll, or vote on a poll (with action=vote) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const meeting = await db.meeting.findUnique({ where: { id } })
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  const action = body.action ?? 'create'

  if (action === 'create') {
    const { question, options, allowMultiple } = body as {
      question: string
      options: string[]
      allowMultiple?: boolean
    }
    if (!question || !Array.isArray(options) || options.length < 2) {
      return NextResponse.json(
        { error: 'question and at least 2 options required' },
        { status: 400 }
      )
    }
    const poll = await db.meetingPoll.create({
      data: {
        meetingId: id,
        userId: user.id,
        question: question.trim(),
        optionsJson: JSON.stringify(options.slice(0, 8)),
        allowMultiple: allowMultiple ?? false,
      },
    })
    return NextResponse.json({ poll })
  }

  if (action === 'vote') {
    const { pollId, optionIdx } = body as {
      pollId: string
      optionIdx: number
    }
    if (!pollId || typeof optionIdx !== 'number') {
      return NextResponse.json(
        { error: 'pollId and optionIdx required' },
        { status: 400 }
      )
    }
    const poll = await db.meetingPoll.findUnique({
      where: { id: pollId },
      include: { votes: true },
    })
    if (!poll) return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    if (poll.isClosed) {
      return NextResponse.json({ error: 'Poll closed' }, { status: 410 })
    }
    const options: string[] = JSON.parse(poll.optionsJson)
    if (optionIdx < 0 || optionIdx >= options.length) {
      return NextResponse.json({ error: 'invalid option' }, { status: 400 })
    }
    if (!poll.allowMultiple) {
      // remove any prior votes by this user on this poll
      await db.meetingPollVote.deleteMany({
        where: { pollId, userId: user.id },
      })
    }
    try {
      await db.meetingPollVote.create({
        data: { pollId, userId: user.id, optionIdx },
      })
    } catch {
      // already voted for this option
    }
    const updated = await db.meetingPoll.findUnique({
      where: { id: pollId },
      include: { votes: true },
    })
    return NextResponse.json({ poll: updated })
  }

  if (action === 'close') {
    const { pollId } = body as { pollId: string }
    const poll = await db.meetingPoll.findUnique({ where: { id: pollId } })
    if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (poll.userId !== user.id && meeting.hostId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const updated = await db.meetingPoll.update({
      where: { id: pollId },
      data: { isClosed: true },
      include: { votes: true },
    })
    return NextResponse.json({ poll: updated })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
