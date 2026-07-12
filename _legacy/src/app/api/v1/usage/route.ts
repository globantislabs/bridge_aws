import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateApiToken, hasScope } from '@/lib/api-auth'

/** GET /api/v1/usage — current token usage stats */
export async function GET(req: NextRequest) {
  const token = await validateApiToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Invalid API token' }, { status: 401 })
  }
  // any scope gives access to its own usage
  const t = await db.apiToken.findUnique({
    where: { id: token.id },
    select: {
      name: true,
      tokenPrefix: true,
      scopesCsv: true,
      quotaMinutes: true,
      usedMinutes: true,
      requestCount: true,
      rateLimitPerMin: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  })
  return NextResponse.json({
    token: t,
    remaining: (t?.quotaMinutes ?? 0) - (t?.usedMinutes ?? 0),
    usagePercent: t ? Math.round((t.usedMinutes / t.quotaMinutes) * 100) : 0,
  })
}
