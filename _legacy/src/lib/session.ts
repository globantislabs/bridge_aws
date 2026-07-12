import { NextRequest, NextResponse } from 'next/server'
import { db } from './db'
import { generateSessionToken } from './crypto'

export interface SessionUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  role: string
  locale: string
  status: string
}

export const SESSION_COOKIE = 'pm_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days
const GUEST_TTL_MS = 1000 * 60 * 60 * 24 * 1 // 1 day

/**
 * Look up the user attached to a request's session cookie.
 * Reads from the DB (not in-memory) so it works across multiple server
 * instances and survives restarts.
 */
export async function getSessionUser(
  req: NextRequest
): Promise<SessionUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  return resolveSessionUser(token)
}

/**
 * Resolve a session token to a user. Also cleans up expired rows.
 */
async function resolveSessionUser(token: string): Promise<SessionUser | null> {
  let session
  try {
    session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    })
  } catch {
    // DB not initialized yet — fail safe (treat as logged out)
    return null
  }
  if (!session) return null
  if (session.revokedAt) return null
  if (session.expiresAt.getTime() < Date.now()) {
    // Expired — delete in the background
    db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  const u = session.user
  if (!u) return null
  if (u.status !== 'active' && u.status !== 'guest') return null
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    role: u.role,
    locale: u.locale,
    status: u.status,
  }
}

/**
 * Create a new DB-backed session for a user and set the cookie on the response.
 * Returns the token.
 */
export async function createSession(
  userId: string,
  req: NextRequest,
  res: NextResponse,
  opts: { guest?: boolean } = {}
): Promise<string> {
  const token = generateSessionToken()
  const ttl = opts.guest ? GUEST_TTL_MS : SESSION_TTL_MS
  const expiresAt = new Date(Date.now() + ttl)
  try {
    await db.session.create({
      data: {
        token,
        userId,
        expiresAt,
        ip: getClientIpSafe(req),
        userAgent: req.headers.get('user-agent')?.slice(0, 255) || null,
      },
    })
  } catch (e) {
    // If the Session table doesn't exist yet (pre-migration), surface the error
    console.error('[session] Failed to persist session:', e)
    throw new Error('Session table missing — run: bunx prisma db push')
  }
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: Math.floor(ttl / 1000),
    path: '/',
  })
  return token
}

/**
 * Soft-revoke (logout) a session by token.
 */
export async function revokeSession(token: string): Promise<void> {
  try {
    await db.session.updateMany({
      where: { token },
      data: { revokedAt: new Date() },
    })
  } catch {
    // ignore
  }
}

/**
 * Periodic cleanup — call from a cron job. Deletes expired sessions.
 */
export async function purgeExpiredSessions(): Promise<number> {
  try {
    const r = await db.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } },
        ],
      },
    })
    return r.count
  } catch {
    return 0
  }
}

function getClientIpSafe(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim().slice(0, 45)
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri.slice(0, 45)
  return 'unknown'
}
