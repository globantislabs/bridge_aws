import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

/** GET /api/meetings/[id] — full meeting details + participants + recent chat */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const meeting = await db.meeting.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, name: true, email: true, avatarUrl: true } },
      participants: {
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
        orderBy: { joinedAt: 'asc' },
      },
      chats: { take: 50, orderBy: { createdAt: 'asc' } },
      polls: { include: { votes: true }, orderBy: { createdAt: 'desc' } },
      breakouts: { include: { members: true } },
    },
  })
  if (!meeting) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ meeting })
}

/** PATCH /api/meetings/[id] — update status, recording, settings */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const meeting = await db.meeting.findUnique({ where: { id } })
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (meeting.hostId !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const allowed: any = {}
  const fields = [
    'title', 'description', 'status', 'transcriptLang', 'targetLangs',
    'isRecording', 'recordStartedAt', 'recordingUrl', 'allowScreenShare',
    'allowChat', 'allowReactions', 'allowRecording', 'e2ee', 'waitingRoom',
    'passcode', 'maxParticipants',
  ]
  for (const f of fields) {
    if (body[f] !== undefined) allowed[f] = body[f]
  }
  if (body.startAt) allowed.startAt = new Date(body.startAt)
  if (body.endAt) allowed.endAt = new Date(body.endAt)
  const updated = await db.meeting.update({ where: { id }, data: allowed })
  return NextResponse.json({ meeting: updated })
}
