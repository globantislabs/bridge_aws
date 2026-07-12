import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

export async function GET(req: NextRequest) {
  const sessionUser = await getSessionUser(req)
  if (!sessionUser) {
    return NextResponse.json({ user: null }, { status: 200 })
  }
  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    include: {
      subscriptions: {
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      apiTokens: { where: { revokedAt: null } },
    },
  })
  if (!user) {
    return NextResponse.json({ user: null })
  }
  // Allow both 'active' users and 'guest' users (created via /api/auth/guest
  // when someone joins via a shareable link). Suspended/banned users are blocked.
  if (user.status !== 'active' && user.status !== 'guest') {
    return NextResponse.json({ user: null, error: 'Account ' + user.status })
  }
  const sub = user.subscriptions[0]
  const plan = sub?.plan
  const apiTokensUsed = user.apiTokens.length
  const meetingMinutesUsed = await db.meetingParticipant
    .count({
      where: {
        userId: user.id,
        meeting: { status: 'ended' },
      },
    })
    .then((c) => c * 12)
    .catch(() => 0)

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      locale: user.locale,
      status: user.status,
      title: user.title,
      company: user.company,
      timezone: user.timezone,
      bio: user.bio,
      planTier: plan?.tier ?? 'free',
      apiTokensUsed,
      apiTokensQuota: plan?.apiTokens ?? 3,
      meetingMinutesUsed,
      meetingMinutesQuota: plan?.meetingMinutes ?? 60,
    },
  })
}
