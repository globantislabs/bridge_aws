'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Video, Hash, Loader2, ArrowRight, Globe, Lock, Users } from 'lucide-react'
import { MeetingsView } from '@/components/views/meetings-view'
import { ToastViewport } from '@/lib/toast-store'
import { useAuthStore } from '@/lib/auth-store'

interface MeetingItem {
  id: string
  title: string
  description: string | null
  startAt: string
  status: string
  joinCode: string
  hostId?: string
  transcriptLang: string
  targetLangs: string
  passcode?: string | null
  waitingRoom?: boolean
  maxParticipants?: number
  allowScreenShare?: boolean
  allowChat?: boolean
  allowReactions?: boolean
  allowRecording?: boolean
  e2ee?: boolean
  _count?: { participants: number }
}

type Phase =
  | 'loading'           // initial load — fetching meeting + checking auth
  | 'checking-auth'     // meeting exists, checking if visitor has a session
  | 'not-found'         // meeting doesn't exist
  | 'guest-prompt'      // meeting exists, visitor not authed → ask for name
  | 'joining'           // creating guest session or calling ?code= to join
  | 'in-room'           // joined — render MeetingRoom
  | 'error'             // join failed

/**
 * Public shareable join page.
 *
 * URL:  /j/WKPROD-7K2
 *
 * Flow:
 *   1. Fetch meeting by share code (public, no auth required)
 *   2. Check if visitor already has a session
 *      - Yes → auto-join as that user
 *      - No  → show guest prompt (enter name → create guest → join)
 *   3. Once joined, render the meeting room inline (full-screen)
 */
export default function JoinByLinkPage() {
  const params = useParams<{ code: string }>()
  const router = useRouter()
  const code = (params?.code || '').toString().toUpperCase()
  const { refresh: refreshAuth } = useAuthStore()

  const [phase, setPhase] = React.useState<Phase>('loading')
  const [meeting, setMeeting] = React.useState<MeetingItem | null>(null)
  const [name, setName] = React.useState('')
  const [errorMsg, setErrorMsg] = React.useState('')

  // ── Step 1: public meeting lookup ───────────────────────────────────────
  React.useEffect(() => {
    if (!code) {
      setPhase('not-found')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/meetings?share=${encodeURIComponent(code)}`, {
          cache: 'no-store',
        })
        if (cancelled) return
        if (!r.ok) {
          setPhase('not-found')
          return
        }
        const data = await r.json()
        if (cancelled) return
        if (!data?.meeting) {
          setPhase('not-found')
          return
        }
        setMeeting(data.meeting)
        // Continue to step 2 (auth check)
        setPhase('checking-auth')
      } catch {
        if (!cancelled) setPhase('not-found')
      }
    })()
    return () => { cancelled = true }
  }, [code])

  // ── Step 2: check existing session; if none, show guest prompt ──────────
  React.useEffect(() => {
    if (phase !== 'checking-auth') return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' })
        if (cancelled) return
        if (r.ok) {
          const data = await r.json()
          if (data?.user?.id) {
            // Already signed in (or already a guest) — join directly.
            setPhase('joining')
            await doJoin()
            return
          }
        }
      } catch {
        // ignore — fall through to guest prompt
      }
      if (!cancelled) setPhase('guest-prompt')
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, code])

  // ── Step 3: actually join the meeting (auto-adds caller as participant) ─
  async function doJoin() {
    setPhase('joining')
    try {
      const r = await fetch(
        `/api/meetings?code=${encodeURIComponent(code)}`,
        { cache: 'no-store' }
      )
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error(e?.error || `Failed to join (HTTP ${r.status})`)
      }
      const data = await r.json()
      if (!data?.meeting) {
        throw new Error('Server returned no meeting')
      }
      setMeeting(data.meeting)
      // Refresh the auth store so the MeetingsView has a valid user.id to
      // use as peerId. Without this, the room renders with peerId='anon'
      // and the participant list won't recognize "me".
      await refreshAuth()
      setPhase('in-room')
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not join meeting')
      setPhase('error')
    }
  }

  async function joinAsGuest() {
    if (!name.trim()) return
    setPhase('joining')
    try {
      // Create a guest account. The /api/auth/guest endpoint issues a
      // session cookie + creates a user record.
      const gRes = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!gRes.ok) {
        const e = await gRes.json().catch(() => ({}))
        throw new Error(e?.error || 'Failed to create guest session')
      }
      // Now join with the freshly minted guest session.
      await doJoin()
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not join meeting')
      setPhase('error')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (phase === 'loading' || phase === 'checking-auth') {
    return <CenteredLoader label="Loading meeting…" />
  }

  if (phase === 'not-found') {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="size-14 rounded-full bg-rose-500/10 text-rose-600 grid place-items-center mx-auto">
            <Hash className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold">Meeting not found</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t find a meeting with code{' '}
            <code className="px-1.5 py-0.5 rounded bg-muted">{code}</code>.
          </p>
          <Button onClick={() => router.push('/')} className="mt-2">
            Go to Bridge
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="size-14 rounded-full bg-rose-500/10 text-rose-600 grid place-items-center mx-auto">
            <Hash className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold">Couldn&apos;t join meeting</h1>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" onClick={() => router.push('/')}>
              Go home
            </Button>
            <Button onClick={() => setPhase('guest-prompt')}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'joining') {
    return <CenteredLoader label="Joining meeting…" />
  }

  // In-room — render the meeting room full-screen.
  if (phase === 'in-room' && meeting) {
    return (
      <>
        <MeetingsView
          initialMeeting={meeting}
          onLeave={() => router.push('/')}
        />
        <ToastViewport />
      </>
    )
  }

  // Guest prompt — ask for a display name.
  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4 sm:p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 text-primary font-semibold text-2xl mb-1">
            <Video className="size-6" />
            Bridge
          </div>
          <p className="text-xs text-muted-foreground">
            Real-time multilingual meetings
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-card space-y-5">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              Joining
            </div>
            <div className="text-lg font-medium leading-snug break-words">
              {meeting?.title || 'Untitled meeting'}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted">
                <Hash className="size-3" />
                {code}
              </span>
              {meeting?.status === 'live' && (
                <span className="inline-flex items-center gap-1 text-emerald-600 px-2 py-0.5 rounded-full bg-emerald-500/10">
                  <span className="size-1.5 rounded-full bg-emerald-500 live-pulse" />
                  LIVE
                </span>
              )}
              {meeting?._count?.participants !== undefined && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted">
                  <Users className="size-3" />
                  {meeting._count.participants} in room
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted">
                <Globe className="size-3" />
                Multilingual
              </span>
              {meeting?.e2ee && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">
                  <Lock className="size-3" />
                  E2EE
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="gname">
              Your name
            </label>
            <Input
              id="gname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && joinAsGuest()}
              placeholder="Enter your name to join"
              autoFocus
              maxLength={80}
            />
            <p className="text-[11px] text-muted-foreground">
              No account needed. You&apos;ll join as a guest.
            </p>
          </div>

          <Button
            onClick={joinAsGuest}
            disabled={!name.trim()}
            className="w-full h-11"
          >
            Join meeting
            <ArrowRight className="size-4 ml-2" />
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-4 px-4">
          By joining, you agree to Bridge&apos;s terms of service.
        </p>
      </div>
    </div>
  )
}

function CenteredLoader({ label }: { label: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="text-center">
        <Loader2 className="size-6 animate-spin mx-auto text-primary mb-3" />
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  )
}
