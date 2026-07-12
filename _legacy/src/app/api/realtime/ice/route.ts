import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { getTurnServers } from '@/lib/system-settings'

/**
 * GET /api/realtime/ice
 *
 * Returns the WebRTC ICE servers (STUN + optional TURN) configured by the
 * super-admin in the system settings. Consumed by the meeting room to build
 * RTCPeerConnection configurations so screen-share & audio/video traffic can
 * traverse NATs without lag.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 })
  }
  const iceServers = await getTurnServers()
  return NextResponse.json({
    iceServers,
    // Use Google's public STUN as fallback even if admin hasn't set anything.
    bundlePolicy: 'max-bundle' as const,
    iceTransportPolicy: 'all' as const,
  })
}
