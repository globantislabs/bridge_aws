import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { generateJoinCode } from '@/lib/crypto'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')?.trim().toUpperCase()
  const shareCode = searchParams.get('share')?.trim().toUpperCase()

  // ── PUBLIC LOOKUP via ?share=CODE ──────────────────────────────────────
  // Used by the public /j/[code] shareable join page to check whether a
  // meeting exists BEFORE the visitor has authenticated (they may need to
  // sign in or create a guest account first). MUST work without a session.
  if (shareCode && !code) {
    const meeting = await db.meeting.findFirst({
      where: { joinCode: shareCode },
      select: {
        id: true,
        title: true,
        description: true,
        joinCode: true,
        status: true,
        startAt: true,
        hostId: true,
        transcriptLang: true,
        targetLangs: true,
        passcode: true,
        waitingRoom: true,
        maxParticipants: true,
        allowScreenShare: true,
        allowChat: true,
        allowReactions: true,
        allowRecording: true,
        e2ee: true,
        _count: { select: { participants: true } },
      },
    })
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }
    return NextResponse.json({ meeting })
  }

  // ── AUTHENTICATED ROUTES BELOW ─────────────────────────────────────────
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ?code=CODE — join the meeting (auto-adds caller as participant).
  if (code) {
    const meeting = await db.meeting.findFirst({
      where: { joinCode: code },
      include: { participants: true },
    })
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }
    // Enforce maxParticipants (host always allowed).
    const activeCount = meeting.participants.filter((p) => !p.leftAt).length
    const isHost = meeting.hostId === user.id
    if (
      !isHost &&
      typeof meeting.maxParticipants === 'number' &&
      meeting.maxParticipants > 0 &&
      activeCount >= meeting.maxParticipants
    ) {
      return NextResponse.json(
        { error: `Meeting is full (${activeCount}/${meeting.maxParticipants})` },
        { status: 403 }
      )
    }
    // Auto-add the caller as a participant so they can join the room.
    let joined = false
    const already = meeting.participants.find(
      (p) => p.userId === user.id && !p.leftAt
    )
    if (!already) {
      try {
        await db.meetingParticipant.create({
          data: {
            meetingId: meeting.id,
            userId: user.id,
            displayName: user.name,
            role: isHost ? 'host' : 'participant',
            joinedAt: new Date(),
            audioOn: true,
            videoOn: true,
          },
        })
        joined = true
      } catch {
        // Already joined (race) — fine.
      }
    }
    // Return full meeting shape so the client can render the room.
    return NextResponse.json({
      meeting: {
        ...meeting,
        participants: undefined,
        _count: { participants: activeCount + (joined ? 1 : 0) },
      },
      joined,
    })
  }

  const meetings = await db.meeting.findMany({
    where: {
      OR: [
        { hostId: user.id },
        { participants: { some: { userId: user.id } } },
      ],
    },
    include: {
      participants: true,
      transcripts: { take: 1, orderBy: { createdAt: 'desc' } },
    },
    orderBy: { startAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ meetings })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const {
    title,
    description,
    startAt,
    targetLangs,
    transcriptLang,
    passcode,
    waitingRoom,
    maxParticipants,
    allowScreenShare,
    allowRecording,
    allowChat,
    allowReactions,
    e2ee,
  } = body as {
    title: string
    description?: string
    startAt?: string
    targetLangs?: string
    transcriptLang?: string
    passcode?: string
    waitingRoom?: boolean
    maxParticipants?: number
    allowScreenShare?: boolean
    allowRecording?: boolean
    allowChat?: boolean
    allowReactions?: boolean
    e2ee?: boolean
  }
  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }
  const joinCode = generateJoinCode()
  const meeting = await db.meeting.create({
    data: {
      title,
      description: description || '',
      hostId: user.id,
      status: startAt ? 'scheduled' : 'live',
      startAt: startAt ? new Date(startAt) : new Date(),
      joinCode,
      passcode: passcode || null,
      waitingRoom: waitingRoom ?? false,
      transcriptLang: transcriptLang || 'en',
      targetLangs:
        targetLangs || 'en,es,fr,de,ja,zh,hi,pt,ar,ru,it,ko',
      maxParticipants: maxParticipants ?? 50,
      allowScreenShare: allowScreenShare ?? true,
      allowRecording: allowRecording ?? true,
      allowChat: allowChat ?? true,
      allowReactions: allowReactions ?? true,
      e2ee: e2ee ?? false,
    },
  })
  // host automatically becomes a participant
  await db.meetingParticipant.create({
    data: {
      meetingId: meeting.id,
      userId: user.id,
      displayName: user.name,
      role: 'host',
      joinedAt: new Date(),
    },
  })
  return NextResponse.json({ meeting })
}
