import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

/** GET /api/admin/usage — per-user usage stats across the platform.
 *  Aggregates: meeting minutes, API token usage, API requests, errors.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  // Aggregate usage per user
  // 1. Meeting minutes (from meeting transcripts — each transcript msg = ~10 seconds of meeting time)
  // 2. API tokens (count of active tokens + their usedMinutes)
  // 3. API requests (from activity log — count of api.* actions)
  // 4. Errors (from activity log — count of severity=error)

  const users = await db.user.findMany({
    include: {
      subscriptions: { include: { plan: true }, take: 1, orderBy: { createdAt: 'desc' } },
      apiTokens: { where: { revokedAt: null } },
      meetings: { select: { id: true, status: true, startAt: true, endAt: true } },
      transcriptMsgs: { select: { id: true, createdAt: true } },
      activityLogs: {
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        select: { id: true, action: true, severity: true, createdAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  const usage = users.map((u) => {
    // Estimate meeting minutes: count of transcript messages × 0.167 (10s per msg) + meeting duration
    const transcriptMinutes = Math.round(u.transcriptMsgs.length * 0.167)
    const meetingMinutesFromTokens = u.apiTokens.reduce((sum, t) => sum + t.usedMinutes, 0)
    const minutes = transcriptMinutes + meetingMinutesFromTokens

    // Tokens: sum of usedMinutes + requestCount across all tokens
    const tokens = u.apiTokens.reduce((sum, t) => sum + t.usedMinutes, 0)
    const requests = u.apiTokens.reduce((sum, t) => sum + t.requestCount, 0)
    const apiActions = u.activityLogs.filter((a) => a.action.startsWith('api.')).length
    const errors = u.activityLogs.filter((a) => a.severity === 'error').length

    const lastActiveAt = u.activityLogs.length > 0
      ? u.activityLogs[u.activityLogs.length - 1].createdAt
      : u.createdAt

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      plan: u.subscriptions[0]?.plan?.tier ?? 'free',
      minutes,
      tokens,
      requests: requests + apiActions,
      errors,
      lastActiveAt,
    }
  })

  return NextResponse.json({ usage })
}
