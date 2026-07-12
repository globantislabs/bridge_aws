import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

/**
 * WebRTC signaling relay. Peers POST signaling messages addressed to a
 * specific peerId and long-poll / GET for messages addressed to them.
 *
 * POST body: { fromPeer, toPeer, type, payload }
 *   - type: 'join' | 'offer' | 'answer' | 'ice' | 'leave'
 *   - payload: JSON string (SDP / ICE candidate)
 *
 * GET ?peer=<peerId>&since=<iso> returns messages addressed to peer.
 */
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
    return NextResponse.json({ error: 'Meeting has ended' }, { status: 410 })
  }
  const body = await req.json()
  const { fromPeer, toPeer, type, payload } = body as {
    fromPeer: string
    toPeer: string
    type: string
    payload: string
  }
  if (!fromPeer || !toPeer || !type) {
    return NextResponse.json(
      { error: 'fromPeer, toPeer, type required' },
      { status: 400 }
    )
  }
  const sig = await db.meetingSignal.create({
    data: {
      meetingId: id,
      fromPeer,
      toPeer,
      type,
      payload: payload ?? '',
    },
  })
  return NextResponse.json({ ok: true, id: sig.id })
}

/**
 * GET /api/meetings/[id]/signal?peer=<peerId>&since=<iso>
 * Long-polls for signaling messages addressed to peer.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const url = new URL(req.url)
  const peer = url.searchParams.get('peer')
  const sinceParam = url.searchParams.get('since')
  if (!peer) {
    return NextResponse.json({ error: 'peer required' }, { status: 400 })
  }
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 30_000)

  // Try a quick poll first; if nothing, wait a little and try again (max ~20s total)
  const maxAttempts = 8
  const delayMs = 2500
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Match messages addressed directly to me OR broadcast to '*' (join/leave)
    const msgs = await db.meetingSignal.findMany({
      where: {
        meetingId: id,
        OR: [{ toPeer: peer }, { toPeer: '*' }],
        createdAt: { gt: since },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })
    if (msgs.length > 0) {
      // Delete consumed DIRECT messages (toPeer === peer) to keep the table small.
      // Broadcast messages (toPeer === '*') are kept until they age out (since param)
      // so all peers get a chance to see them.
      const directMsgIds = msgs.filter((m) => m.toPeer === peer).map((m) => m.id)
      if (directMsgIds.length > 0) {
        db.meetingSignal
          .deleteMany({ where: { id: { in: directMsgIds } } })
          .catch(() => {})
      }
      // Periodically clean up old broadcasts (>60s old) — fire and forget
      db.meetingSignal
        .deleteMany({
          where: { toPeer: '*', createdAt: { lt: new Date(Date.now() - 60_000) } },
        })
        .catch(() => {})
      return NextResponse.json({
        messages: msgs.map((m) => ({
          id: m.id,
          fromPeer: m.fromPeer,
          toPeer: m.toPeer,
          type: m.type,
          payload: m.payload,
          createdAt: m.createdAt,
        })),
      })
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  return NextResponse.json({ messages: [] })
}
