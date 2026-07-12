import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashToken, getClientIp, rateLimit } from '@/lib/crypto'

/**
 * Validates an API token from the Authorization: Bearer <token> header.
 * Returns the token record + user, or null if invalid/expired/revoked.
 */
export async function validateApiToken(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  const raw = auth.slice(7).trim()
  if (!raw.startsWith('pm_')) return null
  const hash = hashToken(raw)
  const token = await db.apiToken.findFirst({
    where: { keyHash: hash, revokedAt: null },
    include: { user: true },
  })
  if (!token) return null
  if (token.expiresAt && token.expiresAt < new Date()) return null
  if (token.user.status !== 'active') return null
  // Check quota
  if (token.usedMinutes >= token.quotaMinutes) return null
  return token
}

export function hasScope(token: { scopesCsv: string }, scope: string): boolean {
  return token.scopesCsv.split(',').map((s) => s.trim()).includes(scope)
}

export async function recordTokenUsage(
  token: { id: string; userId: string; rateLimitPerMin: number },
  req: NextRequest
) {
  const ip = getClientIp(req)
  await db.apiToken.update({
    where: { id: token.id },
    data: {
      lastUsedAt: new Date(),
      lastUsedIp: ip,
      requestCount: { increment: 1 },
    },
  }).catch(() => {})
}

export async function enforceRateLimit(token: { id: string; rateLimitPerMin: number }) {
  return rateLimit(`token:${token.id}`, token.rateLimitPerMin)
}
