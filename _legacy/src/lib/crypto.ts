import { createHash, randomBytes, randomUUID } from 'crypto'

/**
 * Generate a cryptographically secure API token with a prefix and a body.
 * Returns the raw token (only seen by the user at creation time) and the
 * hash + prefix that we store in the database.
 *
 * Format: pm_<8-char-prefix>_<32-char-secret>
 */
export function generateApiToken(): {
  raw: string
  prefix: string
  hash: string
} {
  const prefix = randomBytes(4).toString('hex') // 8 chars
  const secret = randomBytes(16).toString('hex') // 32 chars
  const raw = `pm_${prefix}_${secret}`
  const hash = hashToken(raw)
  return { raw, prefix: `pm_${prefix}`, hash }
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function generateJoinCode(): string {
  const part = () =>
    Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')
  return `${part()}-${part()}`
}

export function generateInvoiceNumber(seq: number): string {
  const year = new Date().getFullYear()
  return `INV-${year}-${String(seq).padStart(5, '0')}`
}

export function shortId(len = 8): string {
  return randomBytes(Math.ceil(len / 2))
    .toString('hex')
    .slice(0, len)
}

/**
 * Get the client's real IP address from a Next.js request, considering
 * common proxy headers (X-Forwarded-For, X-Real-IP).
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri
  return 'unknown'
}

/**
 * Lightweight in-memory rate limiter using a sliding window per key.
 * Returns true if the action should be allowed, false if rate-limited.
 */
const rateBuckets = new Map<string, number[]>()

export function rateLimit(
  key: string,
  maxPerMin: number
): { ok: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const windowStart = now - 60_000
  const arr = (rateBuckets.get(key) ?? []).filter((t) => t > windowStart)
  if (arr.length >= maxPerMin) {
    const oldest = arr[0]
    return {
      ok: false,
      remaining: 0,
      resetIn: Math.max(0, Math.ceil((oldest + 60_000 - now) / 1000)),
    }
  }
  arr.push(now)
  rateBuckets.set(key, arr)
  return {
    ok: true,
    remaining: Math.max(0, maxPerMin - arr.length),
    resetIn: 60,
  }
}
