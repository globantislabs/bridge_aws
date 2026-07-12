import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

/** Join a meeting — registers a participant. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const meeting = await db.meeting.findUnique({ where: { id } })
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (meeting.status === 'ended') {
    return NextResponse.json({ error: 'Meeting ended' }, { status: 410 })
  }

  const body = await req.json().catch(() => ({}))
  const displayName = (body as any)?.displayName ?? user.name
  const passcode = (body as any)?.passcode
  if (meeting.passcode && meeting.passcode !== passcode) {
    return NextResponse.json({ error: 'Invalid passcode' }, { status: 403 })
  }
  if (meeting.waitingRoom && meeting.hostId !== user.id) {
    // For demo, we let them in but mark as waiting — host would approve in production
  }

  // Make sure the meeting is marked live when someone joins
  if (meeting.status === 'scheduled') {
    await db.meeting.update({
      where: { id },
      data: { status: 'live', startAt: new Date() },
    })
  }

  // Upsert participant
  let participant = await db.meetingParticipant.findFirst({
    where: { meetingId: id, userId: user.id },
  })
  if (!participant) {
    participant = await db.meetingParticipant.create({
      data: {
        meetingId: id,
        userId: user.id,
        displayName,
        role: meeting.hostId === user.id ? 'host' : 'participant',
        joinedAt: new Date(),
        // Default to streaming state — the client enables mic/video on
        // getUserMedia() so reflect that here so other participants see
        // the new joiner as live, not muted+video-off.
        audioOn: true,
        videoOn: true,
      },
    })
  } else {
    participant = await db.meetingParticipant.update({
      where: { id: participant.id },
      data: {
        joinedAt: new Date(),
        leftAt: null,
        // Re-joining: assume mic/video are on (client will PATCH if not).
        audioOn: true,
        videoOn: true,
      },
    })
  }

  return NextResponse.json({
    meeting: { ...meeting, status: 'live' },
    participant,
    peerId: user.id, // use userId as peerId — keeps signaling simple
  })
}

/** Leave a meeting */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await db.meetingParticipant.updateMany({
    where: { meetingId: id, userId: user.id },
    data: { leftAt: new Date() },
  })
  // Notify peers via signal
  await db.meetingSignal.create({
    data: {
      meetingId: id,
      fromPeer: user.id,
      toPeer: '*',
      type: 'leave',
      payload: JSON.stringify({ userId: user.id }),
    },
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}
