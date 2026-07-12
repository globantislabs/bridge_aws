import { NextRequest, NextResponse } from 'next/server'
import { revokeSession, SESSION_COOKIE } from '@/lib/session'

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (token) {
    await revokeSession(token)
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
