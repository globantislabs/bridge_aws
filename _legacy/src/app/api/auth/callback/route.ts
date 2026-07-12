import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createServerSupabase, supabaseConfigured } from '@/lib/supabase'
import { randomBytes } from 'crypto'

function issueSession(userId: string, res: NextResponse) {
  const token = randomBytes(32).toString('hex')
  const session = {
    userId,
    token,
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
  }
  res.cookies.set('pm_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  ;(globalThis as any).__sessions = (globalThis as any).__sessions || new Map()
  ;(globalThis as any).__sessions.set(token, session)
  return res
}

/**
 * OAuth callback handler.
 *
 * Production (Supabase configured):
 *   Supabase redirects here with ?code=… We exchange the code for a
 *   session, fetch the user, and create/update our local User record.
 *
 * Sandbox fallback:
 *   The /api/auth/google/consent picker redirects here with
 *   ?provider=google&email=…&name=… We create/find the user directly.
 */
export async function GET(req: NextRequest) {
  const origin =
    req.nextUrl.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  const returnTo = req.nextUrl.searchParams.get('return_to') || '/'

  // ---------- Production path: real Supabase OAuth ----------
  if (supabaseConfigured) {
    const code = req.nextUrl.searchParams.get('code')
    if (!code) {
      return NextResponse.redirect(`${origin}/?auth_error=no_code`)
    }
    const supabase = await createServerSupabase()
    if (!supabase) {
      return NextResponse.redirect(`${origin}/?auth_error=no_supabase`)
    }
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.user) {
      return NextResponse.redirect(
        `${origin}/?auth_error=${encodeURIComponent(
          error?.message || 'no_user'
        )}`
      )
    }
    const email = data.user.email || ''
    const name =
      (data.user.user_metadata?.full_name as string) ||
      (data.user.user_metadata?.name as string) ||
      email.split('@')[0]
    const avatarUrl =
      (data.user.user_metadata?.avatar_url as string) ||
      (data.user.user_metadata?.picture as string) ||
      null
    const providerId = data.user.id
    const provider =
      (data.user.app_metadata?.provider as string) || 'supabase'

    // Find or create local user
    let user = await db.user.findFirst({
      where: { OR: [{ email }, { provider, providerId }] },
    })
    if (!user) {
      user = await db.user.create({
        data: {
          email,
          name,
          avatarUrl,
          provider,
          providerId,
          role: email.endsWith('@admin.local') ? 'admin' : 'user',
        },
      })
    } else {
      user = await db.user.update({
        where: { id: user.id },
        data: { name, avatarUrl, provider, providerId },
      })
    }
    const res = NextResponse.redirect(`${origin}${returnTo}`)
    return issueSession(user.id, res)
  }

  // ---------- Sandbox path: built-in account picker callback ----------
  const provider = req.nextUrl.searchParams.get('provider') || 'google'
  const email = req.nextUrl.searchParams.get('email')
  const name = req.nextUrl.searchParams.get('name')
  if (!email) {
    return NextResponse.redirect(`${origin}/?auth_error=no_email`)
  }

  let user = await db.user.findUnique({ where: { email } })
  if (!user) {
    user = await db.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
        provider,
        providerId: `${provider}-${Buffer.from(email).toString('hex')}`,
        role: email.endsWith('@admin.local') ? 'admin' : 'user',
        avatarUrl: null,
      },
    })
  } else if (!user.provider) {
    // Link existing email/password user to Google
    user = await db.user.update({
      where: { id: user.id },
      data: {
        provider,
        providerId: `${provider}-${Buffer.from(email).toString('hex')}`,
      },
    })
  }

  const res = NextResponse.redirect(`${origin}${returnTo}`)
  return issueSession(user.id, res)
}
