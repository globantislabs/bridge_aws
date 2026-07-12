'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Label,
} from '@/components/ui/label'
import {
  Textarea,
} from '@/components/ui/textarea'
import {
  Video,
  Plus,
  Calendar,
  Keyboard,
  Hash,
  ChevronRight,
  Clock,
  Link2,
  ArrowRight,
} from 'lucide-react'
import { useToast } from '@/lib/toast-store'
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
  _count?: { participants: number }
}

/**
 * HomeView — Google Meet / Zoom style opening screen.
 *
 * Layout: two columns.
 *   Left: hero text + big "New meeting" / "Schedule" / "Join with code" actions.
 *   Right: upcoming meetings list.
 *
 * No charts, no stats, no email preview. Just the actions a user needs to
 * start or join a meeting in one click.
 */
export function HomeView({ onJoinMeeting }: { onJoinMeeting: (m: MeetingItem) => void }) {
  const toast = useToast()
  const { user } = useAuthStore()
  const [joinCode, setJoinCode] = React.useState('')
  const [scheduleOpen, setScheduleOpen] = React.useState(false)
  const [meetings, setMeetings] = React.useState<MeetingItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [creatingInstant, setCreatingInstant] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const r = await fetch('/api/meetings')
      const data = await r.json()
      setMeetings(data.meetings ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  async function startInstantMeeting() {
    setCreatingInstant(true)
    try {
      const title = `${user?.name?.split(' ')[0] || 'Instant'}'s meeting`
      // No startAt => API marks as 'live' with startAt = now
      const r = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          transcriptLang: 'en',
          targetLangs: ['en', 'es', 'fr', 'de', 'ja', 'zh', 'hi'].join(','),
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      toast.success('Meeting started')
      onJoinMeeting(data.meeting)
    } catch (e: any) {
      toast.error('Could not start meeting', e.message)
    } finally {
      setCreatingInstant(false)
    }
  }

  async function joinByCode() {
    const code = joinCode.trim().toUpperCase()
    if (!code) {
      toast.error('Enter a code')
      return
    }
    // Always hit the API — it both looks up the meeting by joinCode AND
    // auto-adds the caller as a participant, so the meeting shows up in
    // their upcoming list afterwards.
    try {
      const r = await fetch(`/api/meetings?code=${encodeURIComponent(code)}`)
      const data = await r.json()
      if (r.ok && data.meeting) {
        onJoinMeeting(data.meeting)
        setJoinCode('')
        if (data.joined) {
          toast.success('Joined meeting', `Added as participant — code ${code}`)
        }
        return
      }
      if (r.status === 404) {
        toast.error('Meeting not found', `No meeting with code ${code}`)
        return
      }
      throw new Error(data?.error || 'Failed')
    } catch (e: any) {
      toast.error('Could not join', e?.message || 'Network error')
    }
  }

  const now = new Date()
  const upcoming = meetings
    .filter(
      (m) =>
        m.status === 'scheduled' &&
        new Date(m.startAt).getTime() > now.getTime() - 30 * 60 * 1000
    )
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 5)

  const live = meetings.filter((m) => m.status === 'live')

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-6xl mx-auto px-6 py-10 md:py-16">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          {/* LEFT — Hero + Actions */}
          <div className="space-y-8">
            <div>
              <h1
                className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] text-foreground"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {greeting()}, {user?.name?.split(' ')[0] || 'there'}.
              </h1>
              <p className="mt-3 text-base md:text-lg text-muted-foreground">
                Start an instant meeting, schedule one for later, or join with a code.
              </p>
            </div>

            <div className="space-y-3">
              {/* New meeting — primary CTA */}
              <button
                onClick={startInstantMeeting}
                disabled={creatingInstant}
                className="w-full flex items-center justify-between gap-3 rounded-2xl bg-primary text-primary-foreground px-6 py-5 text-left shadow-card hover:shadow-popover transition-all disabled:opacity-60"
              >
                <div className="flex items-center gap-4">
                  <div className="size-11 rounded-full bg-primary-foreground/15 grid place-items-center">
                    <Video className="size-5" />
                  </div>
                  <div>
                    <div className="text-base font-medium leading-tight">
                      {creatingInstant ? 'Starting…' : 'New meeting'}
                    </div>
                    <div className="text-xs text-primary-foreground/75 mt-0.5">
                      Start an instant meeting right now
                    </div>
                  </div>
                </div>
                <ArrowRight className="size-5 opacity-80" />
              </button>

              {/* Schedule */}
              <button
                onClick={() => setScheduleOpen(true)}
                className="w-full flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-6 py-4 text-left hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-full bg-accent grid place-items-center">
                    <Calendar className="size-5 text-accent-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Schedule</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Plan a meeting for later
                    </div>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>

              {/* Join with code */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Keyboard className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Join with a code</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && joinByCode()}
                    placeholder="e.g. WKPROD-7K2"
                    className="h-10 flex-1 uppercase"
                    style={{ fontFamily: 'var(--font-sans)' }}
                  />
                  <Button
                    onClick={joinByCode}
                    disabled={!joinCode.trim()}
                    className="h-10 px-5"
                  >
                    Join
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — Upcoming list */}
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Upcoming
              </h2>
              {upcoming.length > 0 && (
                <button
                  onClick={() => load()}
                  className="text-xs text-primary hover:underline"
                >
                  Refresh
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : live.length === 0 && upcoming.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                <Calendar className="size-8 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No upcoming meetings.
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Start an instant meeting or schedule one for later.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {live.map((m) => (
                  <UpcomingItem
                    key={m.id}
                    meeting={m}
                    live
                    onJoin={() => onJoinMeeting(m)}
                  />
                ))}
                {upcoming.map((m) => (
                  <UpcomingItem
                    key={m.id}
                    meeting={m}
                    onJoin={() => onJoinMeeting(m)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onCreated={(m) => {
          setScheduleOpen(false)
          load()
          const link = `${window.location.origin}/j/${m.joinCode}`
          toast.success(
            'Meeting scheduled',
            `Shareable link: ${link} (also copied to clipboard)`
          )
          // Best-effort copy to clipboard
          try {
            navigator.clipboard?.writeText(link).catch(() => {})
          } catch {}
          onJoinMeeting(m)
        }}
      />
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function UpcomingItem({
  meeting,
  onJoin,
  live,
}: {
  meeting: MeetingItem
  onJoin: () => void
  live?: boolean
}) {
  const toast = useToast()
  const date = new Date(meeting.startAt)
  async function copyLink() {
    const link = `${window.location.origin}/j/${meeting.joinCode}`
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copied', 'Anyone with this link can join')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = link
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
      toast.success('Link copied', 'Anyone with this link can join')
    }
  }
  return (
    <div className="group rounded-xl border border-border bg-card p-4 hover:shadow-card transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            {live && (
              <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 h-5 px-1.5 text-[10px]">
                <span className="size-1.5 rounded-full bg-emerald-500 mr-1 live-pulse" />
                LIVE
              </Badge>
            )}
            <div className="font-medium text-sm truncate">{meeting.title}</div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {date.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}{' '}
              ·{' '}
              {date.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Hash className="size-3" />
              {meeting.joinCode}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={copyLink}
            className="size-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Copy shareable link"
            aria-label="Copy shareable link"
          >
            <Link2 className="size-3.5" />
          </button>
          <Button
            size="sm"
            variant={live ? 'default' : 'outline'}
            className="h-8"
            onClick={onJoin}
          >
            {live ? 'Join' : 'Start'}
            <ChevronRight className="size-3.5 ml-0.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Minimal schedule dialog — title + time + languages only.
 * No advanced options (waiting room, E2EE, max participants) — keep it simple.
 */
function ScheduleDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (m: MeetingItem) => void
}) {
  const toast = useToast()
  const [title, setTitle] = React.useState('')
  const [startAt, setStartAt] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setTitle('')
      const d = new Date()
      d.setMinutes(d.getMinutes() + 30)
      d.setSeconds(0, 0)
      // Format as local datetime-local value
      const tzOffset = d.getTimezoneOffset() * 60000
      setStartAt(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16))
    }
  }, [open])

  async function submit() {
    if (!title.trim()) {
      toast.error('Please enter a title')
      return
    }
    if (!startAt) {
      toast.error('Please pick a date and time')
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          startAt: new Date(startAt).toISOString(),
          status: 'scheduled',
          transcriptLang: 'en',
          targetLangs: ['en', 'es', 'fr', 'de', 'ja', 'zh', 'hi'].join(','),
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      onCreated(data.meeting)
    } catch (e: any) {
      toast.error('Could not schedule', e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule a meeting</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sch-title">Title</Label>
            <Input
              id="sch-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly sync"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sch-when">When</Label>
            <Input
              id="sch-when"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>
          <div className="rounded-lg bg-accent/40 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Link2 className="size-3.5" />
              <span className="font-medium text-foreground">Auto-generated join code</span>
            </div>
            Participants can join using a short code once the meeting is created.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Scheduling…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
