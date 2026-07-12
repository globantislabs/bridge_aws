import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

/** PATCH — update participant state (audio/video/hand/pin/mute-others) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const {
    participantId,
    audioOn,
    videoOn,
    handRaised,
    isPinned,
    isMuted,
    role,
    leftAt,
  } = body as {
    participantId: string
    audioOn?: boolean
    videoOn?: boolean
    handRaised?: boolean
    isPinned?: boolean
    isMuted?: boolean
    role?: string
    leftAt?: string | null
  }
  if (!participantId) {
    return NextResponse.json({ error: 'participantId required' }, { status: 400 })
  }
  const data: any = {}
  if (audioOn !== undefined) data.audioOn = audioOn
  if (videoOn !== undefined) data.videoOn = videoOn
  if (handRaised !== undefined) {
    data.handRaised = handRaised
    data.handRaisedAt = handRaised ? new Date() : null
  }
  if (isPinned !== undefined) data.isPinned = isPinned
  if (isMuted !== undefined) data.isMuted = isMuted
  if (role !== undefined) data.role = role
  if (leftAt !== undefined) data.leftAt = leftAt ? new Date(leftAt) : null
  const p = await db.meetingParticipant.update({
    where: { id: participantId },
    data,
  })
  return NextResponse.json({ participant: p })
}

/** GET — list participants */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const participants = await db.meetingParticipant.findMany({
    where: { meetingId: id, leftAt: null },
    include: {
      user: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
    },
    orderBy: [{ handRaised: 'desc' }, { handRaisedAt: 'asc' }, { joinedAt: 'asc' }],
  })
  return NextResponse.json({ participants })
}
