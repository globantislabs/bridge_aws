import { NextRequest, NextResponse } from 'next/server'
import { purgeExpiredSessions } from '@/lib/session'

/**
 * GET /api/cron/sessions-purge
 *
 * Cron job — call every hour to delete expired/revoked sessions from the DB.
 * Protect with CRON_SECRET header (set in .env).
 *
 * AWS App Runner / EventBridge example:
 *   curl -H "x-cron-secret: $CRON_SECRET" https://your-app.com/api/cron/sessions-purge
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const deleted = await purgeExpiredSessions()
  return NextResponse.json({ ok: true, purged: deleted })
}
