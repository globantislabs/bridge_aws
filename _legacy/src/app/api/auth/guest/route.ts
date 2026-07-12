import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomBytes } from 'crypto'
import { createSession } from '@/lib/session'

/**
 * POST /api/auth/guest
 * Body: { name: string }
 *
 * Creates a temporary guest account so anyone with a shareable meeting link
 * can join without signing up. The guest is given the 'user' role but is
 * marked with status='guest' so the host can see who is a guest in the room.
 *
 * Issues the same `pm_session` cookie as the normal login flow.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const name = (body?.name || '').toString().trim().slice(0, 80)
    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    // Generate a unique guest email. Stored under the @guest.bridge.app
    // namespace so they can be filtered out of normal user lists.
    const guestId = randomBytes(6).toString('hex')
    const email = `guest-${guestId}@guest.bridge.app`

    const user = await db.user.create({
      data: {
        email,
        name,
        // Guests have no password — they can only authenticate via the
        // session cookie issued below.
        passwordHash: '',
        role: 'user',
        status: 'guest',
        locale: 'en',
      },
    })

    // Issue session via DB-backed session store
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
    })
    await createSession(user.id, req, res, { guest: true })
    return res
  } catch (e: any) {
    console.error('[auth/guest] error:', e)
    return NextResponse.json(
      { error: e?.message || 'Failed to create guest session' },
      { status: 500 }
    )
  }
}
