/**
 * Supabase integration layer.
 *
 * This module provides a typed Supabase client for both browser and server
 * contexts. It is fully optional: when NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are present in the environment, the auth
 * flow uses real Supabase Auth (email + Google OAuth). When they are
 * absent, the application falls back to the built-in Prisma-based auth
 * so the product is always runnable in any environment.
 *
 * To enable real Supabase + Google OAuth in production:
 *  1. Create a project at https://supabase.com
 *  2. Add the following env vars:
 *       NEXT_PUBLIC_SUPABASE_URL
 *       NEXT_PUBLIC_SUPABASE_ANON_KEY
 *       SUPABASE_SERVICE_ROLE_KEY  (server-only, for user admin)
 *  3. In Supabase Dashboard → Authentication → Providers → Google:
 *       - Enable Google
 *       - Add Client ID + Client Secret from Google Cloud Console
 *       - Set redirect URL to https://your-domain.com/api/auth/callback
 *  4. Restart the app — Google sign-in will now route through Supabase.
 */

import { createBrowserClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const supabaseConfigured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

/**
 * Browser-side Supabase client. Safe to import from 'use client' components.
 * Returns null when Supabase env vars are not set.
 */
export function createClientSupabase() {
  if (!supabaseConfigured) return null
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * Server-side Supabase client (uses Next.js cookies()).
 * Returns null when Supabase env vars are not set.
 */
export async function createServerSupabase() {
  if (!supabaseConfigured) return null
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safe to ignore when middleware
            // refreshes sessions.
          }
        },
      },
    }
  )
}

export type SupabaseUser = {
  id: string
  email: string
  name?: string
  avatarUrl?: string
  provider?: string
}
