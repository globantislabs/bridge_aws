'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, ScreenShare, ScreenShareOff,
  Hand, MessageSquare, Users, Plus, Calendar, Clock, Globe, Sparkles,
  Phone, Copy, Share2, Volume2, Captions, Send, Languages, Wifi, Shield,
  Lock, Users2, Pin, MoreVertical, Smile, BarChart3, Settings, Check,
  ChevronRight, Clock3, Hash, UserCircle2, Radio, Crown, Hand as HandIcon,
  PenLine, X, Link2, Monitor,
} from 'lucide-react'
import { useToast } from '@/lib/toast-store'
import { useAuthStore, useNavStore } from '@/lib/auth-store'
import { LiveTranslationPanel, TranslationEntry } from '@/components/views/live-translation-panel'
import { Whiteboard } from '@/components/views/whiteboard'

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

const LANGS = [
  ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'],
  ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['ru', 'Russian'],
  ['pl', 'Polish'], ['tr', 'Turkish'], ['ar', 'Arabic'], ['hi', 'Hindi'],
  ['bn', 'Bengali'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean'],
  ['vi', 'Vietnamese'], ['th', 'Thai'], ['id', 'Indonesian'], ['sv', 'Swedish'],
]

const REACTIONS = ['👍', '❤️', '😂', '🎉', '👏', '🔥', '😮', '🤔']

export function MeetingsView({
  initialMeeting,
  onLeave,
}: {
  initialMeeting?: MeetingItem
  onLeave?: () => void
}) {
  const { user } = useAuthStore()
  // useNavStore is always called (Rules of Hooks), but when this view is
  // rendered standalone (e.g. /j/[code] join page), onLeave is provided and
  // initialMeeting is set, so we never fall through to the nav-driven path.
  const { activeParam, setView } = useNavStore()
  const toast = useToast()
  const [meetings, setMeetings] = React.useState<MeetingItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [scheduleOpen, setScheduleOpen] = React.useState(false)
  const [joinOpen, setJoinOpen] = React.useState(false)
  const [activeMeeting, setActiveMeeting] = React.useState<MeetingItem | null>(
    initialMeeting ?? null
  )

  const load = React.useCallback(async () => {
    setLoading(true)
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
    if (user) load()
  }, [user, load])

  React.useEffect(() => {
    if (activeParam && meetings.length > 0) {
      const m = meetings.find((x) => x.id === activeParam)
      if (m) setActiveMeeting(m)
    }
  }, [activeParam, meetings])

  if (activeMeeting) {
    return (
      <MeetingRoom
        meeting={activeMeeting}
        onLeave={() => {
          setActiveMeeting(null)
          if (onLeave) {
            onLeave()
          } else {
            setView('meetings')
            load()
          }
        }}
      />
    )
  }

  const now = new Date()
  const live = meetings.filter((m) => m.status === 'live')
  const upcoming = meetings
    .filter((m) => m.status === 'scheduled' && new Date(m.startAt) > now)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  const past = meetings
    .filter((m) => m.status === 'ended')
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Hero */}
      <Card className="overflow-hidden border-emerald-500/20 shadow-card">
        <div className="bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <Badge variant="outline" className="gap-1.5 mb-2 bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                <Sparkles className="size-3" />
                Real-Time AI Translation · WebRTC
              </Badge>
              <h2 className="text-2xl font-semibold tracking-tight">
                Start or join a meeting
              </h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-lg">
                Browser-native WebRTC video, live captions powered by speech-to-text,
                and real-time AI translation in 20+ languages. No plugins required.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setScheduleOpen(true)}>
                <Plus className="size-4 mr-1.5" />
                Schedule meeting
              </Button>
              <Button variant="outline" onClick={() => setJoinOpen(true)}>
                <Phone className="size-4 mr-1.5" />
                Join with code
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {live.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 live-pulse" />
            Live now
          </h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {live.map((m) => (
              <MeetingCard key={m.id} meeting={m} onJoin={() => setActiveMeeting(m)} live />
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Calendar className="size-4 text-muted-foreground" />
          Upcoming
        </h3>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No upcoming meetings. Schedule one to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((m) => (
              <MeetingCard key={m.id} meeting={m} onJoin={() => setActiveMeeting(m)} />
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            Recently ended
          </h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {past.map((m) => (
              <MeetingCard key={m.id} meeting={m} ended />
            ))}
          </div>
        </div>
      )}

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onCreated={(m) => {
          setScheduleOpen(false)
          load()
          toast.success('Meeting scheduled')
          setActiveMeeting(m)
        }}
      />
      <JoinDialog
        open={joinOpen}
        onOpenChange={setJoinOpen}
        meetings={meetings}
        onJoined={(m) => {
          setJoinOpen(false)
          setActiveMeeting(m)
        }}
      />
    </div>
  )
}

function MeetingCard({
  meeting, onJoin, live, ended,
}: {
  meeting: MeetingItem
  onJoin?: () => void
  live?: boolean
  ended?: boolean
}) {
  const date = new Date(meeting.startAt)
  return (
    <Card className="overflow-hidden hover:shadow-popover transition-shadow group">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold truncate">{meeting.title}</div>
            {meeting.description && (
              <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {meeting.description}
              </div>
            )}
          </div>
          {live && (
            <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
              <span className="size-1.5 rounded-full bg-emerald-500 mr-1 live-pulse" />
              LIVE
            </Badge>
          )}
          {ended && <Badge variant="secondary">Ended</Badge>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" />
            {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Hash className="size-3" />
            {meeting.joinCode}
          </span>
          <span className="inline-flex items-center gap-1">
            <Languages className="size-3" />
            {meeting.transcriptLang.toUpperCase()}
          </span>
        </div>
        {ended ? (
          <Button variant="outline" size="sm" className="w-full" disabled>
            View recording
          </Button>
        ) : (
          <Button size="sm" className="w-full" onClick={onJoin}>
            {live ? 'Join now' : 'Start meeting'}
            <ChevronRight className="size-4 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function ScheduleDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (m: MeetingItem) => void
}) {
  const toast = useToast()
  const [title, setTitle] = React.useState('')
  const [desc, setDesc] = React.useState('')
  const [startAt, setStartAt] = React.useState('')
  const [transcriptLang, setTranscriptLang] = React.useState('en')
  const [targetLangs, setTargetLangs] = React.useState<string[]>(['en', 'es', 'fr', 'de', 'ja', 'zh', 'hi'])
  const [passcode, setPasscode] = React.useState('')
  const [waitingRoom, setWaitingRoom] = React.useState(false)
  const [allowChat, setAllowChat] = React.useState(true)
  const [allowReactions, setAllowReactions] = React.useState(true)
  const [allowScreenShare, setAllowScreenShare] = React.useState(true)
  const [allowRecording, setAllowRecording] = React.useState(true)
  const [e2ee, setE2ee] = React.useState(false)
  const [maxParticipants, setMaxParticipants] = React.useState(50)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      const d = new Date()
      d.setMinutes(d.getMinutes() + 10)
      d.setSeconds(0, 0)
      setStartAt(d.toISOString().slice(0, 16))
    }
  }, [open])

  async function submit() {
    if (!title.trim()) {
      toast.error('Title required')
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: desc,
          startAt: new Date(startAt).toISOString(),
          transcriptLang,
          targetLangs: targetLangs.join(','),
          passcode: passcode || undefined,
          waitingRoom,
          allowChat,
          allowReactions,
          allowScreenShare,
          allowRecording,
          e2ee,
          maxParticipants,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      onCreated(data.meeting)
      setTitle(''); setDesc('')
    } catch (e: any) {
      toast.error(e.message || 'Failed to schedule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule a meeting</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly team sync" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Optional agenda" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start time</Label>
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Source (speaker) language</Label>
              <Select value={transcriptLang} onValueChange={setTranscriptLang}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGS.map(([c, n]) => <SelectItem key={c} value={c}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Translation languages</Label>
            <div className="flex flex-wrap gap-1.5">
              {LANGS.map(([c, n]) => {
                const active = targetLangs.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setTargetLangs((prev) =>
                        prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                      )
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card hover:bg-muted border-border'
                    }`}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Passcode (optional)</Label>
              <Input value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Leave empty for none" />
            </div>
            <div className="space-y-2">
              <Label>Max participants</Label>
              <Input type="number" min={2} max={500} value={maxParticipants} onChange={(e) => setMaxParticipants(Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <ToggleRow label="Waiting room" checked={waitingRoom} onChange={setWaitingRoom} icon={<Users2 className="size-4" />} />
            <ToggleRow label="End-to-end encryption" checked={e2ee} onChange={setE2ee} icon={<Shield className="size-4" />} />
            <ToggleRow label="Allow chat" checked={allowChat} onChange={setAllowChat} icon={<MessageSquare className="size-4" />} />
            <ToggleRow label="Allow reactions" checked={allowReactions} onChange={setAllowReactions} icon={<Smile className="size-4" />} />
            <ToggleRow label="Allow screen share" checked={allowScreenShare} onChange={setAllowScreenShare} icon={<ScreenShare className="size-4" />} />
            <ToggleRow label="Allow recording" checked={allowRecording} onChange={setAllowRecording} icon={<Radio className="size-4" />} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Scheduling…' : 'Schedule meeting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ToggleRow({
  label, checked, onChange, icon,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  icon?: React.ReactNode
}) {
  return (
    <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-card cursor-pointer hover:bg-muted/50">
      <span className="flex items-center gap-2 text-sm">
        {icon}
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

function JoinDialog({
  open, onOpenChange, meetings, onJoined,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  meetings: MeetingItem[]
  onJoined: (m: MeetingItem) => void
}) {
  const [code, setCode] = React.useState('')
  const [looking, setLooking] = React.useState(false)
  const [found, setFound] = React.useState<MeetingItem | null>(null)
  const [error, setError] = React.useState('')
  const toast = useToast()

  // Reset state when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setCode(''); setFound(null); setError(''); setLooking(false)
    }
  }, [open])

  // Debounced server lookup by code — works for ANY meeting, not just ones
  // the user is already a participant of. Uses the public ?share= endpoint.
  React.useEffect(() => {
    if (!code.trim()) {
      setFound(null); setError(''); setLooking(false)
      return
    }
    const cleaned = code.trim().toUpperCase()
    // First check local meetings (instant, no network)
    const local = meetings.find((m) => m.joinCode.toUpperCase() === cleaned)
    if (local) {
      setFound(local); setError(''); setLooking(false)
      return
    }
    // Otherwise query the server
    setLooking(true); setError('')
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/meetings?share=${encodeURIComponent(cleaned)}`, { cache: 'no-store' })
        if (r.ok) {
          const data = await r.json()
          if (data?.meeting) {
            setFound(data.meeting)
            setError('')
          } else {
            setFound(null)
            setError('No meeting matches that code.')
          }
        } else {
          setFound(null)
          setError('No meeting matches that code.')
        }
      } catch {
        setFound(null)
        setError('Could not look up meeting.')
      } finally {
        setLooking(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [code, meetings])

  async function handleJoin() {
    if (!found) return
    try {
      // Join via the authenticated ?code= endpoint — adds caller as participant.
      const r = await fetch(`/api/meetings?code=${encodeURIComponent(found.joinCode.toUpperCase())}`, { cache: 'no-store' })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error(e?.error || 'Failed to join')
      }
      const data = await r.json()
      toast.success('Joined meeting')
      onJoined(data.meeting || found)
    } catch (e: any) {
      toast.error(e?.message || 'Could not join')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Join with code</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && found) handleJoin() }}
            placeholder="XXXX-XXXX"
            className="text-center font-mono tracking-widest uppercase"
            autoFocus
          />
          {looking && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="size-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              Looking up meeting…
            </p>
          )}
          {!looking && error && (
            <p className="text-xs text-rose-500">{error}</p>
          )}
          {found && (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="p-3 text-sm">
                <div className="font-semibold">{found.title}</div>
                {found.description && (
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{found.description}</div>
                )}
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                  <span>{new Date(found.startAt).toLocaleString()}</span>
                  {found.status === 'live' && (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <span className="size-1.5 rounded-full bg-emerald-500 live-pulse" />
                      LIVE
                    </span>
                  )}
                  {found._count?.participants !== undefined && (
                    <span>{found._count.participants} in room</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!found || looking} onClick={handleJoin}>
            {found ? 'Join meeting' : 'Enter code'}
            {found && <ChevronRight className="size-4 ml-1" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ============================================================
 * MeetingRoom — REAL WebRTC video conference
 * ============================================================ */

interface Participant {
  id: string
  userId: string | null
  displayName: string
  role: string
  audioOn: boolean
  videoOn: boolean
  handRaised: boolean
  handRaisedAt?: string | null
  isPinned: boolean
  isMuted: boolean
  joinedAt: string | null
  leftAt?: string | null
  user?: { id: string; name: string; email: string; avatarUrl?: string | null }
}

interface ChatMsg {
  id: string
  userId: string | null
  displayName: string
  message: string
  translated: string | null
  targetLang: string | null
  isSystem: boolean
  createdAt: string
}

interface ReactionMsg {
  id: string
  userId: string | null
  displayName: string
  emoji: string
  createdAt: string
}

interface PollData {
  id: string
  question: string
  optionsJson: string
  allowMultiple: boolean
  isClosed: boolean
  votes: { userId: string; optionIdx: number }[]
}

interface Caption {
  id: string
  speakerName: string
  sourceText: string
  sourceLang: string
  targetText: string
  targetLang: string
  createdAt: string
}

function MeetingRoom({
  meeting, onLeave,
}: {
  meeting: MeetingItem
  onLeave: () => void
}) {
  const { user } = useAuthStore()
  const toast = useToast()
  // peerId MUST match the user.id stored on the server (MeetingParticipant.userId).
  // The /api/auth/guest endpoint creates a real User row with a real cuid id,
  // so even guests have a stable user.id. We use that as peerId so the
  // participants list (which returns userId) correctly identifies "me".
  const peerId = user?.id ?? 'anon'

  // Local media
  const localVideoRef = React.useRef<HTMLVideoElement>(null)
  const localStreamRef = React.useRef<MediaStream | null>(null)
  const [audioOn, setAudioOn] = React.useState(true)
  const [videoOn, setVideoOn] = React.useState(true)
  const [screenSharing, setScreenSharing] = React.useState(false)
  const screenStreamRef = React.useRef<MediaStream | null>(null)
  // localStreamReady forces a re-render once getUserMedia resolves so the
  // local video tile appears immediately (refs don't trigger re-renders).
  const [localStreamReady, setLocalStreamReady] = React.useState(false)
  // remoteStreamVersion bumps every time a remote stream is added/removed,
  // so videoTiles is recomputed with the latest ref data.
  const [remoteStreamVersion, setRemoteStreamVersion] = React.useState(0)

  // WebRTC peers — keyed by peerId
  const peersRef = React.useRef<Map<string, RTCPeerConnection>>(new Map())
  const remoteStreamsRef = React.useRef<Map<string, MediaStream>>(new Map())
  const [pinnedPeer, setPinnedPeer] = React.useState<string | null>(null)
  const [knownPeers, setKnownPeers] = React.useState<string[]>([])

  // Broadcast translation track — when non-null, this is the speaker's
  // translated voice (from LiveTranslationPanel's MediaStreamDestination).
  // We replaceTrack on every peer's audio sender so listeners hear the
  // translation instead of the original mic audio. New peers (joined
  // mid-broadcast) get this track in createPeer instead of the mic track.
  const broadcastTrackRef = React.useRef<MediaStreamTrack | null>(null)

  // ICE servers — fetched once from /api/realtime/ice (admin-configured TURN/STUN).
  // Falls back to Google STUN if the endpoint fails or admin hasn't set TURN.
  const iceServersRef = React.useRef<RTCIceServer[]>([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ])
  React.useEffect(() => {
    let cancelled = false
    fetch('/api/realtime/ice')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.iceServers?.length) return
        iceServersRef.current = d.iceServers as RTCIceServer[]
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // UI state
  const [participants, setParticipants] = React.useState<Participant[]>([])
  const [chats, setChats] = React.useState<ChatMsg[]>([])
  const [reactions, setReactions] = React.useState<ReactionMsg[]>([])
  const [floatingReactions, setFloatingReactions] = React.useState<{ id: string; emoji: string; x: number }[]>([])
  const [polls, setPolls] = React.useState<PollData[]>([])
  const [captions, setCaptions] = React.useState<Caption[]>([])
  const [activeCaption, setActiveCaption] = React.useState<Caption | null>(null)

  // Translation
  const [targetLang, setTargetLang] = React.useState('es')
  const [captionsEnabled, setCaptionsEnabled] = React.useState(true)
  const [autoTranslate, setAutoTranslate] = React.useState(true)

  // Layout
  const [activeTab, setActiveTab] = React.useState<'translate' | 'chat' | 'participants' | 'polls' | 'whiteboard'>('translate')
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [sidePanelOpen, setSidePanelOpen] = React.useState(false)
  const [chatInput, setChatInput] = React.useState('')
  const [chatTranslate, setChatTranslate] = React.useState(true)
  const [pollDialogOpen, setPollDialogOpen] = React.useState(false)
  const [reactionPickerOpen, setReactionPickerOpen] = React.useState(false)
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false)

  // Recording (visual only — actual recording would use MediaRecorder)
  const [isRecording, setIsRecording] = React.useState(false)
  const [recordingSecs, setRecordingSecs] = React.useState(0)
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null)
  const recordedChunksRef = React.useRef<Blob[]>([])

  // Speech recognition for live captions
  const recognitionRef = React.useRef<any>(null)
  const [interimCaption, setInterimCaption] = React.useState('')

  /* ---------- 1. Initialize local media ---------- */
  const initLocalMedia = React.useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: 30 },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.muted = true
      }
      // Apply initial mute state
      stream.getAudioTracks().forEach((t) => (t.enabled = audioOn))
      stream.getVideoTracks().forEach((t) => (t.enabled = videoOn))
      // Trigger re-render so the local video tile appears immediately.
      setLocalStreamReady(true)
    } catch (e: any) {
      toast.error('Camera/mic access denied: ' + (e?.message ?? 'unknown'))
      // Even on failure, trigger re-render so the tile shows the avatar fallback.
      setLocalStreamReady(true)
    }
  }, [audioOn, videoOn, toast])

  /* ---------- 2. Join meeting ---------- */
  const joinMeeting = React.useCallback(async () => {
    try {
      await fetch(`/api/meetings/${meeting.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: user?.name ?? 'Guest' }),
      })
    } catch (e) {
      // ignore
    }
  }, [meeting.id, user])

  /* ---------- 3. WebRTC peer connection ---------- */
  const createPeer = React.useCallback(
    (otherPeerId: string, initiator: boolean) => {
      if (peersRef.current.has(otherPeerId)) return peersRef.current.get(otherPeerId)!
      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        bundlePolicy: 'max-bundle',
        iceTransportPolicy: 'all',
        // Allow 4 ICE candidate gather rounds for better connection quality
        // across NATs.
      })
      const remoteStream = new MediaStream()
      remoteStreamsRef.current.set(otherPeerId, remoteStream)

      pc.ontrack = (event) => {
        const stream = event.streams[0]
        remoteStreamsRef.current.set(otherPeerId, stream)
        // Bump version to trigger re-render with latest ref data.
        setRemoteStreamVersion((v) => v + 1)
      }
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(otherPeerId, 'ice', JSON.stringify(event.candidate.toJSON())).catch(() => {})
        }
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          peersRef.current.delete(otherPeerId)
          remoteStreamsRef.current.delete(otherPeerId)
          setRemoteStreamVersion((v) => v + 1)
        }
      }

      // Add local tracks
      const localStream = localStreamRef.current
      if (localStream) {
        for (const track of localStream.getTracks()) {
          // When broadcasting translation, substitute the broadcast track for
          // the mic audio track. New peers (joined mid-broadcast) get the
          // translated voice from the moment they connect — no need for a
          // renegotiation round-trip.
          if (
            track.kind === 'audio' &&
            broadcastTrackRef.current &&
            broadcastTrackRef.current.readyState === 'live'
          ) {
            pc.addTrack(broadcastTrackRef.current, localStream)
          } else {
            pc.addTrack(track, localStream)
          }
        }
      }

      // If we are the initiator (smaller peerId wins to avoid glare)
      if (initiator) {
        pc.onnegotiationneeded = async () => {
          try {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            await sendSignal(otherPeerId, 'offer', JSON.stringify(pc.localDescription))
          } catch (e) {
            // ignore
          }
        }
      }

      peersRef.current.set(otherPeerId, pc)
      return pc
    },
    []
  )

  const sendSignal = React.useCallback(
    async (toPeer: string, type: string, payload: string) => {
      await fetch(`/api/meetings/${meeting.id}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromPeer: peerId, toPeer, type, payload }),
      })
    },
    [meeting.id, peerId]
  )

  /* ---------- 4. Signaling poll loop ---------- */
  const signalLoopRef = React.useRef<boolean>(false)
  const startSignalLoop = React.useCallback(() => {
    if (signalLoopRef.current) return
    signalLoopRef.current = true
    // CRITICAL: initialize `since` to 60 seconds in the PAST, not now.
    // If we start at "now", we will miss any 'join' signals that other
    // peers sent before we started polling — which is the #1 cause of
    // "multiple users can't join the same meeting".
    let since = new Date(Date.now() - 60_000).toISOString()
    const tick = async () => {
      if (!signalLoopRef.current) return
      try {
        const r = await fetch(
          `/api/meetings/${meeting.id}/signal?peer=${encodeURIComponent(peerId)}&since=${encodeURIComponent(since)}`
        )
        if (r.ok) {
          const data = await r.json()
          const msgs = data.messages ?? []
          if (msgs.length > 0) {
            since = msgs[msgs.length - 1].createdAt
          }
          for (const m of msgs) {
            await handleSignal(m)
          }
        }
      } catch (e) {
        // ignore
      }
      setTimeout(tick, 400)
    }
    tick()
  }, [meeting.id, peerId])

  const handleSignal = React.useCallback(
    async (msg: { fromPeer: string; type: string; payload: string }) => {
      const otherPeerId = msg.fromPeer
      if (otherPeerId === peerId) return
      if (msg.type === 'join' || msg.type === 'leave') {
        if (msg.type === 'join') {
          // Add to known peers and create connection if we are initiator
          setKnownPeers((prev) => prev.includes(otherPeerId) ? prev : [...prev, otherPeerId])
          // Glare avoidance: smaller id initiates
          if (peerId < otherPeerId) {
            createPeer(otherPeerId, true)
          }
        } else {
          // leave: close peer
          const pc = peersRef.current.get(otherPeerId)
          if (pc) {
            pc.close()
            peersRef.current.delete(otherPeerId)
          }
          remoteStreamsRef.current.delete(otherPeerId)
          setRemoteStreamVersion((v) => v + 1)
          setKnownPeers((prev) => prev.filter((p) => p !== otherPeerId))
        }
        return
      }
      let pc = peersRef.current.get(otherPeerId)
      if (!pc) {
        // Peer contacted us first; we are not initiator
        pc = createPeer(otherPeerId, false)
        setKnownPeers((prev) => prev.includes(otherPeerId) ? prev : [...prev, otherPeerId])
      }
      try {
        if (msg.type === 'offer') {
          const desc = JSON.parse(msg.payload)
          await pc.setRemoteDescription(new RTCSessionDescription(desc))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await sendSignal(otherPeerId, 'answer', JSON.stringify(pc.localDescription))
        } else if (msg.type === 'answer') {
          const desc = JSON.parse(msg.payload)
          if (pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(desc))
          }
        } else if (msg.type === 'ice') {
          const cand = JSON.parse(msg.payload)
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand))
          } catch {
            // sometimes candidates arrive before remote description
          }
        }
      } catch (e) {
        // ignore
      }
    },
    [peerId, createPeer, sendSignal]
  )

  /* ---------- 5. Announce our join on startup ---------- */
  const announceJoin = React.useCallback(async () => {
    // Send a join signal addressed to '*' — server can fan-out, but our simple
    // impl has each peer poll for messages with toPeer=peerId. So instead we
    // query participants and send 'join' to each.
    try {
      const r = await fetch(`/api/meetings/${meeting.id}/participants`)
      if (!r.ok) return
      const data = await r.json()
      const others: Participant[] = (data.participants ?? []).filter(
        (p: Participant) => p.userId && p.userId !== peerId
      )
      for (const p of others) {
        const otherPeerId = p.userId!
        setKnownPeers((prev) => prev.includes(otherPeerId) ? prev : [...prev, otherPeerId])
        await sendSignal(otherPeerId, 'join', JSON.stringify({ displayName: user?.name }))
        // If we should initiate
        if (peerId < otherPeerId) {
          createPeer(otherPeerId, true)
        }
      }
      setParticipants(data.participants ?? [])
    } catch (e) {
      // ignore
    }
  }, [meeting.id, peerId, user, sendSignal, createPeer])

  /* ---------- 6. Periodic participant + chat + reactions polling ---------- */
  const pollParticipants = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/meetings/${meeting.id}/participants`)
      if (r.ok) {
        const data = await r.json()
        setParticipants(data.participants ?? [])
        // For any new participants, announce ourselves
        const others = (data.participants ?? []).filter(
          (p: Participant) => p.userId && p.userId !== peerId
        )
        for (const p of others) {
          const otherPeerId = p.userId!
          if (!knownPeers.includes(otherPeerId)) {
            setKnownPeers((prev) => [...prev, otherPeerId])
            await sendSignal(otherPeerId, 'join', JSON.stringify({ displayName: user?.name }))
            if (peerId < otherPeerId) createPeer(otherPeerId, true)
          }
        }
      }
    } catch {}
  }, [meeting.id, peerId, knownPeers, sendSignal, createPeer, user])

  const pollChats = React.useCallback(async (since?: string) => {
    try {
      const url = `/api/meetings/${meeting.id}/chats${since ? `?since=${encodeURIComponent(since)}` : ''}`
      const r = await fetch(url)
      if (r.ok) {
        const data = await r.json()
        const newChats: ChatMsg[] = data.chats ?? []
        if (newChats.length > 0) {
          setChats((prev) => {
            const ids = new Set(prev.map((c) => c.id))
            const merged = [...prev, ...newChats.filter((c) => !ids.has(c.id))]
            return merged.slice(-200)
          })
        }
      }
    } catch {}
  }, [meeting.id])

  const pollReactions = React.useCallback(async (since?: string) => {
    try {
      const url = `/api/meetings/${meeting.id}/reactions${since ? `?since=${encodeURIComponent(since)}` : ''}`
      const r = await fetch(url)
      if (r.ok) {
        const data = await r.json()
        const newReactions: ReactionMsg[] = data.reactions ?? []
        if (newReactions.length > 0) {
          setReactions((prev) => [...prev, ...newReactions].slice(-50))
          // Spawn floating reactions
          for (const r of newReactions) {
            const id = `${r.id}-${Math.random()}`
            const x = 20 + Math.random() * 60
            setFloatingReactions((prev) => [...prev, { id, emoji: r.emoji, x }])
            setTimeout(() => {
              setFloatingReactions((prev) => prev.filter((f) => f.id !== id))
            }, 2500)
          }
        }
      }
    } catch {}
  }, [meeting.id])

  const pollPolls = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/meetings/${meeting.id}/polls`)
      if (r.ok) {
        const data = await r.json()
        setPolls(data.polls ?? [])
      }
    } catch {}
  }, [meeting.id])

  /* ---------- 7. Speech-to-text for live captions ---------- */
  const startCaptions = React.useCallback(() => {
    if (!captionsEnabled) return
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    if (!SR) {
      // Browser doesn't support Web Speech API — fail gracefully
      return
    }
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = meeting.transcriptLang === 'en' ? 'en-US' : meeting.transcriptLang
    recognition.onresult = async (event: any) => {
      let interim = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += transcript
        else interim += transcript
      }
      setInterimCaption(interim)
      if (finalText.trim().length > 0) {
        const sourceText = finalText.trim()
        let targetText = sourceText
        if (autoTranslate && targetLang !== meeting.transcriptLang) {
          try {
            const r = await fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: sourceText,
                sourceLang: meeting.transcriptLang,
                targetLang,
              }),
            })
            const data = await r.json()
            if (r.ok && data.translated) targetText = data.translated
          } catch {}
        }
        const caption: Caption = {
          id: `local-${Date.now()}`,
          speakerName: user?.name ?? 'Me',
          sourceText,
          sourceLang: meeting.transcriptLang,
          targetText,
          targetLang,
          createdAt: new Date().toISOString(),
        }
        setCaptions((prev) => [...prev.slice(-30), caption])
        setActiveCaption(caption)
        setTimeout(() => setActiveCaption(null), 6000)
        // Persist transcript
        try {
          await fetch(`/api/meetings/${meeting.id}/transcripts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              speakerName: caption.speakerName,
              sourceLang: caption.sourceLang,
              sourceText: caption.sourceText,
              targetLang: caption.targetLang,
              targetText: caption.targetText,
            }),
          })
        } catch {}
      }
    }
    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        // ignore most errors; speech recognition can be flaky
      }
    }
    recognition.onend = () => {
      // Auto-restart if still enabled
      if (captionsEnabledRef.current) {
        try { recognition.start() } catch {}
      }
    }
    recognition.start()
    recognitionRef.current = recognition
  }, [captionsEnabled, autoTranslate, targetLang, meeting.transcriptLang, meeting.id, user])

  const captionsEnabledRef = React.useRef(captionsEnabled)
  React.useEffect(() => { captionsEnabledRef.current = captionsEnabled }, [captionsEnabled])

  /* ---------- 8. Mount: initialize everything ---------- */
  React.useEffect(() => {
    // Don't start WebRTC until we have a real user.id to use as peerId.
    // Otherwise guests would announce as 'anon' and never see other peers.
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      await initLocalMedia()
      if (cancelled) return
      await joinMeeting()
      startSignalLoop()
      await announceJoin()
      startCaptions()
      // Initial fetches
      pollChats()
      pollReactions()
      pollPolls()
    })()

    // Polling intervals
    const p1 = setInterval(pollParticipants, 4000)
    const p2 = setInterval(() => pollChats(chats.length > 0 ? chats[chats.length - 1].createdAt : undefined), 3000)
    const p3 = setInterval(() => pollReactions(reactions.length > 0 ? reactions[reactions.length - 1].createdAt : undefined), 2000)
    const p4 = setInterval(pollPolls, 5000)

    return () => {
      cancelled = true
      signalLoopRef.current = false
      clearInterval(p1); clearInterval(p2); clearInterval(p3); clearInterval(p4)
      // Stop speech
      try { recognitionRef.current?.stop() } catch {}
      // Stop local tracks
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
      // Drop the broadcast track ref so any in-flight createPeer (unlikely
      // at this point) doesn't try to add a stale track. The track itself
      // is owned by LiveTranslationPanel and gets cleaned up by its own
      // unmount effect (which calls onBroadcastTrack(null) first).
      broadcastTrackRef.current = null
      // Close peers
      for (const pc of peersRef.current.values()) {
        try { pc.close() } catch {}
      }
      peersRef.current.clear()
      // Announce leave
      sendSignal('*', 'leave', JSON.stringify({ userId: peerId })).catch(() => {})
      fetch(`/api/meetings/${meeting.id}/join`, { method: 'DELETE' }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  /* ---------- 9. Recording (local MediaRecorder) ---------- */
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      setIsRecording(false)
      toast.info('Recording saved to your downloads')
    } else {
      if (!localStreamRef.current) return
      const stream = localStreamRef.current
      const mr = new MediaRecorder(stream, { mimeType: 'video/webm' })
      recordedChunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${meeting.title.replace(/\s+/g, '_')}-${Date.now()}.webm`
        a.click()
        URL.revokeObjectURL(url)
      }
      mr.start(1000)
      mediaRecorderRef.current = mr
      setIsRecording(true)
      toast.success('Recording started')
    }
  }
  React.useEffect(() => {
    if (!isRecording) return
    const t = setInterval(() => setRecordingSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [isRecording])

  /* ---------- 10. Control actions ---------- */
  /**
   * Apply a given audio track (or null) to every peer connection's audio
   * sender via replaceTrack. Used by the broadcast translation feature:
   *   - track = translated voice track → listeners hear translation
   *   - track = null → restore original mic audio track
   *
   * Safe to call multiple times — find() returns the first audio sender
   * (or the first sender with no track, in case the original mic track was
   * never added) and replaceTrack is a no-op if the track is identical.
   */
  const applyAudioTrackToAllPeers = (track: MediaStreamTrack | null) => {
    for (const pc of peersRef.current.values()) {
      const senders = pc.getSenders()
      // Prefer a sender that already has an audio track; fall back to a
      // sender with no track at all (in case audio was somehow dropped).
      let audioSender: RTCRtpSender | undefined = senders.find(
        (s) => s.track?.kind === 'audio'
      )
      if (!audioSender) audioSender = senders.find((s) => !s.track)
      if (audioSender) {
        audioSender.replaceTrack(track).catch(() => {})
      }
    }
  }

  /**
   * Called by LiveTranslationPanel when the speaker enables/disables
   * "Broadcast translation". When a non-null track arrives, we swap it in
   * on every peer's audio sender. When null, we restore the original mic
   * track from localStreamRef. We also remember the current broadcast
   * track in a ref so newly-joining peers get the translated track in
   * createPeer (no renegotiation round-trip needed).
   */
  const handleBroadcastTrack = React.useCallback(
    (track: MediaStreamTrack | null) => {
      broadcastTrackRef.current = track
      if (track) {
        applyAudioTrackToAllPeers(track)
      } else {
        // Restore original mic track on all peers
        const micTrack = localStreamRef.current?.getAudioTracks()[0] ?? null
        applyAudioTrackToAllPeers(micTrack)
      }
    },
    []
  )

  const toggleAudio = async () => {
    const next = !audioOn
    setAudioOn(next)
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next))
    // Sync to server so other participants see the mic indicator update.
    const me = participants.find((p) => p.userId === peerId)
    if (me) {
      try {
        await fetch(`/api/meetings/${meeting.id}/participants`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantId: me.id, audioOn: next }),
        })
      } catch {}
    }
  }
  const toggleVideo = async () => {
    const next = !videoOn
    setVideoOn(next)
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next))
    // Sync to server so other participants see the camera indicator update.
    const me = participants.find((p) => p.userId === peerId)
    if (me) {
      try {
        await fetch(`/api/meetings/${meeting.id}/participants`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantId: me.id, videoOn: next }),
        })
      } catch {}
    }
  }
  const toggleScreenShare = async () => {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
      setScreenSharing(false)
      // Re-apply camera tracks to all peers
      const cameraStream = localStreamRef.current
      if (cameraStream) {
        for (const pc of peersRef.current.values()) {
          const senders = pc.getSenders()
          const videoSender = senders.find((s) => s.track?.kind === 'video')
          const newTrack = cameraStream.getVideoTracks()[0]
          if (videoSender && newTrack) {
            await videoSender.replaceTrack(newTrack)
            // Restore camera defaults: medium bitrate, balanced degradation.
            const params = videoSender.getParameters()
            if (!params.encodings) params.encodings = [{}]
            params.encodings[0].maxBitrate = 1_500_000 // 1.5 Mbps for camera
            params.encodings[0].priority = 'medium'
            params.degradationPreference = 'balanced'
            try { await videoSender.setParameters(params) } catch {}
          }
        }
      }
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current
      }
    } else {
      try {
        // Capture screen at high resolution & frame rate. Surface 1080p @ 30fps
        // for crisp text rendering (the #1 cause of "laggy" screen share is the
        // browser defaulting to 720p with heavy compression).
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30, max: 60 },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          } as MediaTrackConstraints,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          } as MediaTrackConstraints,
        })
        screenStreamRef.current = stream

        // Apply content hint + degradation preference so the encoder prioritizes
        // RESOLUTION over frame rate (text stays sharp even on poor networks).
        const screenTrack = stream.getVideoTracks()[0]
        if (screenTrack) {
          try {
            ;(screenTrack as any).contentHint = 'detail'
          } catch {}
        }

        // Replace video track in all peer connections and bump the encoder
        // bitrate to 4 Mbps + priority 'high' for crisp screen content.
        for (const pc of peersRef.current.values()) {
          const senders = pc.getSenders()
          const videoSender = senders.find((s) => s.track?.kind === 'video')
          if (videoSender && screenTrack) {
            await videoSender.replaceTrack(screenTrack)
            const params = videoSender.getParameters()
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}]
            }
            params.encodings[0].maxBitrate = 4_000_000 // 4 Mbps for screen
            params.encodings[0].priority = 'high'
            params.degradationPreference = 'maintain-resolution'
            try { await videoSender.setParameters(params) } catch {}
          }
        }

        // Show screen in local preview
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }
        // When the user clicks "Stop sharing" in the browser chrome:
        screenTrack.onended = () => {
          setScreenSharing(false)
          screenStreamRef.current = null
          if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current
          }
          // Restore camera track on peers
          const cameraStream = localStreamRef.current
          if (cameraStream) {
            for (const pc of peersRef.current.values()) {
              const senders = pc.getSenders()
              const videoSender = senders.find((s) => s.track?.kind === 'video')
              const newTrack = cameraStream.getVideoTracks()[0]
              if (videoSender && newTrack) {
                videoSender.replaceTrack(newTrack).catch(() => {})
                const params = videoSender.getParameters()
                if (!params.encodings) params.encodings = [{}]
                params.encodings[0].maxBitrate = 1_500_000
                params.encodings[0].priority = 'medium'
                params.degradationPreference = 'balanced'
                try { videoSender.setParameters(params) } catch {}
              }
            }
          }
        }
        setScreenSharing(true)
        toast.success('Sharing screen — high definition mode')
      } catch (e: any) {
        toast.error('Screen share failed: ' + (e?.message ?? 'unknown'))
      }
    }
  }
  const [handRaised, setHandRaised] = React.useState(false)
  const toggleHand = async () => {
    const next = !handRaised
    setHandRaised(next)
    // Find our participant and update
    const me = participants.find((p) => p.userId === peerId)
    if (me) {
      try {
        await fetch(`/api/meetings/${meeting.id}/participants`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantId: me.id, handRaised: next }),
        })
      } catch {}
    }
  }
  const sendReaction = async (emoji: string) => {
    try {
      await fetch(`/api/meetings/${meeting.id}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
    } catch {}
  }
  const sendChat = async () => {
    if (!chatInput.trim()) return
    try {
      await fetch(`/api/meetings/${meeting.id}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: chatInput.trim(),
          targetLang: chatTranslate ? targetLang : undefined,
          translate: chatTranslate,
        }),
      })
      setChatInput('')
    } catch {}
  }
  const leaveMeeting = () => {
    onLeave()
  }

  /* ---------- 11. Derived data ---------- */
  const handRaisedQueue = participants
    .filter((p) => p.handRaised && !p.leftAt)
    .sort((a, b) => (a.handRaisedAt ?? '').localeCompare(b.handRaisedAt ?? ''))
  // Reference localStreamReady and remoteStreamVersion so this recomputes
  // when async media operations complete (refs alone don't trigger renders).
  void localStreamReady
  void remoteStreamVersion
  const videoTiles: { peerId: string; name: string; stream: MediaStream | null; isLocal: boolean; isHost: boolean; handRaised: boolean; audioOn: boolean; videoOn: boolean; isScreenShare?: boolean }[] = [
    {
      peerId,
      name: screenSharing ? `${user?.name ?? 'You'} · screen` : (user?.name ?? 'You'),
      // When screen-sharing, show the screen stream as the local tile so
      // the user can preview what they're sharing (NOT their camera).
      stream: screenSharing ? (screenStreamRef.current ?? localStreamRef.current) : localStreamRef.current,
      isLocal: true,
      isHost: meeting.hostId === peerId,
      handRaised,
      audioOn,
      videoOn: true, // always show the screen / camera preview locally
      isScreenShare: screenSharing,
    },
    ...Array.from(remoteStreamsRef.current.entries()).map(([pid, stream]) => {
      const p = participants.find((x) => x.userId === pid)
      return {
        peerId: pid,
        name: p?.displayName ?? pid,
        stream,
        isLocal: false,
        isHost: p?.role === 'host',
        handRaised: p?.handRaised ?? false,
        audioOn: p?.audioOn ?? true,
        videoOn: p?.videoOn ?? true,
      }
    }),
  ]
  const pinnedTile = pinnedPeer ? videoTiles.find((t) => t.peerId === pinnedPeer) : null

  // Guard: if user hasn't loaded yet (e.g. guest just created, auth store
  // still syncing), show a loader instead of rendering with peerId='anon'.
  // This prevents the WebRTC logic from announcing the wrong peerId.
  if (!user) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 text-white grid place-items-center">
        <div className="text-center">
          <div className="size-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-white/60">Preparing your session…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 text-white flex flex-col select-none overflow-hidden">
      {/* ============================================================
       *  Top overlay header — always visible (compact on mobile)
       * ============================================================ */}
      <header
        className="absolute top-0 left-0 right-0 z-30 flex items-center px-2 sm:px-4 gap-1.5 sm:gap-3 bg-gradient-to-b from-black/70 to-transparent h-12"
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <span className={`size-2 rounded-full shrink-0 ${isRecording ? 'bg-red-500 live-pulse' : 'bg-emerald-400'}`} />
          <span className="text-[11px] sm:text-[13px] font-medium truncate">{meeting.title}</span>
          {isRecording && (
            <span className="hidden sm:inline-flex text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 items-center gap-1 shrink-0">
              <span className="size-1.5 rounded-full bg-red-500 live-pulse" />
              REC {Math.floor(recordingSecs / 60)}:{String(recordingSecs % 60).padStart(2, '0')}
            </span>
          )}
          <span className="text-[11px] text-white/50 hidden lg:inline shrink-0">
            · {meeting.joinCode}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1 text-[11px] text-white/70 px-2 py-1 rounded-full bg-white/5">
            <Users className="size-3" />
            <span className="hidden sm:inline">{participants.filter((p) => !p.leftAt).length}</span>
          </div>
          <button
            onClick={() => setShareDialogOpen(true)}
            className="flex items-center gap-1.5 text-[11px] text-white/90 px-2.5 py-1 rounded-full bg-indigo-500/30 hover:bg-indigo-500/50 border border-indigo-400/30 transition-colors"
            title="Share meeting"
          >
            <Link2 className="size-3" />
            <span className="hidden md:inline">Share</span>
          </button>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-white/70 px-2 py-1 rounded-full bg-white/5">
            <Languages className="size-3" />
            {targetLang.toUpperCase()}
          </div>
          {meeting.e2ee && (
            <div className="hidden md:flex items-center gap-1 text-[11px] text-emerald-300 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Lock className="size-3" />
              E2EE
            </div>
          )}
        </div>
      </header>

      {/* ============================================================
       *  Main video area — fills the entire viewport
       * ============================================================ */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Floating reactions layer */}
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          {floatingReactions.map((r) => (
            <div
              key={r.id}
              className="absolute bottom-32 text-4xl reaction-float"
              style={{ left: `${r.x}%` }}
            >
              {r.emoji}
            </div>
          ))}
        </div>

        {/* Pinned tile (large) */}
        {pinnedTile ? (
          <div className="flex-1 p-3 pt-14 min-h-0">
            <VideoTile tile={pinnedTile} large onUnpin={() => setPinnedPeer(null)} />
          </div>
        ) : null}

        {/* Grid of tiles — fills entire screen */}
        <div className={`flex-1 p-3 pt-14 min-h-0 ${pinnedTile ? 'hidden' : ''}`}>
          <VideoGrid tiles={videoTiles} onPin={(pid) => setPinnedPeer(pid)} />
        </div>

        {/* Pinned tile filmstrip */}
        {pinnedTile && (
          <div className="absolute left-3 right-3 bottom-24 z-20 flex gap-2 overflow-x-auto pb-1">
            {videoTiles.filter((t) => t.peerId !== pinnedPeer).map((t) => (
              <MiniTile key={t.peerId} tile={t} onClick={() => setPinnedPeer(t.peerId)} />
            ))}
          </div>
        )}

        {/* Live caption — floating, bottom-center */}
        {(activeCaption || interimCaption) && captionsEnabled && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 max-w-2xl px-4 z-20 caption-in pointer-events-none">
            <div className="bg-black/75 text-white rounded-lg px-4 py-2 text-center backdrop-blur-sm shadow-float">
              {activeCaption ? (
                <>
                  <div className="text-[10px] opacity-60 mb-0.5 uppercase tracking-wider">
                    {activeCaption.speakerName} · {activeCaption.targetLang.toUpperCase()}
                  </div>
                  <div className="text-sm md:text-base">{activeCaption.targetText}</div>
                </>
              ) : (
                <div className="text-sm opacity-60 italic">{interimCaption}</div>
              )}
            </div>
          </div>
        )}

        {/* Right side panel — toggleable drawer.
            Desktop: 360px right-docked overlay.
            Mobile: bottom sheet covering 65% of viewport height — keeps the
            user's own video tile visible at the top so they can still see
            themselves while chatting/translating.
            NOTE: The <aside> is always mounted (we use CSS visibility to hide
            it when closed) so the LiveTranslationPanel's realtime WebSocket
            and mic stream stay alive when the user closes the panel. */}
        <aside
          className={`absolute right-0 z-30
                      top-[35%] bottom-0
                      md:top-0 md:bottom-0
                      left-0 md:left-auto
                      w-full md:w-[360px]
                      bg-slate-800 border-l border-white/10 flex flex-col shadow-2xl
                      md:rounded-none rounded-t-2xl
                      transition-transform duration-200
                      ${sidePanelOpen ? 'translate-y-0' : 'translate-y-full md:translate-x-full pointer-events-none'}`}
          aria-hidden={!sidePanelOpen}
        >
            {/* Mobile backdrop — only covers bottom 65% to keep video visible.
                Only shown when panel is open. */}
            {sidePanelOpen && (
              <div
                className="absolute inset-x-0 bottom-0 top-[35%] bg-black/40 z-20 md:hidden"
                onClick={() => setSidePanelOpen(false)}
              />
            )}
            {/* Mobile grab handle */}
            <div className="md:hidden h-1.5 bg-white/20 rounded-full w-12 mx-auto mt-2 shrink-0" />
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col min-h-0">
                <div className="h-12 border-b border-white/10 flex items-center px-2 gap-0.5 shrink-0">
                  <button
                    onClick={() => setSidePanelOpen(false)}
                    className="size-8 grid place-items-center rounded hover:bg-white/5 text-white/70"
                    aria-label="Close panel"
                  >
                    <X className="size-4" />
                  </button>
                  <div className="w-px h-5 bg-white/10 mx-1" />
                  <TabsList className="grid grid-cols-5 rounded-none bg-transparent h-9 p-0 flex-1">
                    <TabsTrigger value="translate" className="rounded data-[state=active]:bg-white/10 gap-1 px-1 text-[10px] text-white/80">
                      <Languages className="size-3.5" />
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="rounded data-[state=active]:bg-white/10 gap-1 px-1 text-[10px] text-white/80">
                      <MessageSquare className="size-3.5" />
                    </TabsTrigger>
                    <TabsTrigger value="participants" className="rounded data-[state=active]:bg-white/10 gap-1 px-1 text-[10px] text-white/80 relative">
                      <Users className="size-3.5" />
                      {handRaisedQueue.length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 px-1 rounded-full bg-amber-500 text-amber-950 text-[9px] font-bold">
                          {handRaisedQueue.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="polls" className="rounded data-[state=active]:bg-white/10 gap-1 px-1 text-[10px] text-white/80">
                      <BarChart3 className="size-3.5" />
                    </TabsTrigger>
                    <TabsTrigger value="whiteboard" className="rounded data-[state=active]:bg-white/10 gap-1 px-1 text-[10px] text-white/80">
                      <PenLine className="size-3.5" />
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Translate tab — KEEP MOUNTED (hidden via CSS) so the realtime
                    WebSocket + mic stream stay alive when the user switches to
                    chat/participants/etc. or closes the panel. Without this,
                    translation stops the moment the panel is hidden. */}
                <TabsContent value="translate" className="flex-1 flex flex-col min-h-0 mt-0 text-white data-[state=inactive]:hidden">
                  <LiveTranslationPanel
                    meetingId={meeting.id}
                    transcriptLang={meeting.transcriptLang}
                    userName={user?.name ?? 'Guest'}
                    onBroadcastTrack={handleBroadcastTrack}
                    onPersist={(entry: TranslationEntry) => {
                      fetch(`/api/meetings/${meeting.id}/transcripts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          speakerName: entry.speakerName,
                          sourceLang: entry.sourceLang,
                          sourceText: entry.sourceText,
                          targetLang: entry.targetLang,
                          targetText: entry.targetText,
                        }),
                      }).catch(() => {})
                    }}
                  />
                </TabsContent>

                <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 mt-0">
                  <ScrollArea className="flex-1 px-3">
                    <div className="py-3 space-y-2">
                      {chats.length === 0 && (
                        <div className="text-center text-xs text-white/40 py-6">
                          No messages yet. Say hello!
                        </div>
                      )}
                      {chats.map((c) => (
                        <div key={c.id} className={`flex flex-col ${c.userId === peerId ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm ${c.userId === peerId ? 'bg-primary text-white' : 'bg-white/10 text-white'}`}>
                            <div className="text-[10px] opacity-60 mb-0.5">{c.userId === peerId ? 'You' : c.displayName}</div>
                            <div>{c.message}</div>
                            {c.translated && c.translated !== c.message && (
                              <div className="text-[11px] opacity-70 italic mt-1 pt-1 border-t border-white/10">
                                → {c.translated}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <div className="border-t border-white/10 p-2 space-y-2">
                    <label className="flex items-center gap-2 text-xs text-white/60">
                      <input
                        type="checkbox"
                        checked={chatTranslate}
                        onChange={(e) => setChatTranslate(e.target.checked)}
                        className="size-3.5"
                      />
                      Translate to {targetLang.toUpperCase()}
                    </label>
                    <div className="flex gap-1.5">
                      <Input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                        placeholder="Message…"
                        className="h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40"
                      />
                      <Button size="icon" className="h-8 w-8 shrink-0" onClick={sendChat}>
                        <Send className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="participants" className="flex-1 min-h-0 mt-0 overflow-y-auto">
                  <div className="py-2">
                    {handRaisedQueue.length > 0 && (
                      <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20">
                        <div className="text-xs font-medium text-amber-300 flex items-center gap-1.5 mb-1">
                          <HandIcon className="size-3.5" /> Hands raised ({handRaisedQueue.length})
                        </div>
                        {handRaisedQueue.map((p) => (
                          <div key={p.id} className="text-xs flex items-center gap-2 py-0.5 text-white/80">
                            <Avatar className="size-5">
                              <AvatarFallback className="text-[10px] bg-white/10">{p.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            {p.displayName}
                          </div>
                        ))}
                      </div>
                    )}
                    {participants.filter((p) => !p.leftAt).map((p) => (
                      <div key={p.id} className="px-3 py-2 flex items-center gap-2 hover:bg-white/5">
                        <Avatar className="size-7">
                          <AvatarFallback className="text-[11px] bg-white/10 text-white">{p.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate flex items-center gap-1 text-white">
                            {p.displayName}
                            {p.userId === peerId && <span className="text-[10px] text-white/40">(you)</span>}
                          </div>
                          <div className="text-[10px] text-white/40 flex items-center gap-1 capitalize">
                            {p.role === 'host' && <Crown className="size-2.5 text-amber-400" />}
                            {p.role}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {p.audioOn ? <Mic className="size-3 text-white/40" /> : <MicOff className="size-3 text-red-400" />}
                          {p.videoOn ? <Video className="size-3 text-white/40" /> : <VideoOff className="size-3 text-white/40" />}
                          {p.handRaised && <Hand className="size-3 text-amber-400" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="polls" className="flex-1 min-h-0 mt-0 overflow-y-auto">
                  <div className="p-3 space-y-3">
                    <Button size="sm" className="w-full" onClick={() => setPollDialogOpen(true)}>
                      <Plus className="size-4 mr-1" /> New poll
                    </Button>
                    {polls.length === 0 && (
                      <div className="text-center text-xs text-white/40 py-6">
                        No polls yet. Create one to gather feedback.
                      </div>
                    )}
                    {polls.map((poll) => {
                      const options: string[] = JSON.parse(poll.optionsJson)
                      const totalVotes = poll.votes.length
                      const myVotes = poll.votes.filter((v) => v.userId === peerId).map((v) => v.optionIdx)
                      return (
                        <div key={poll.id} className="rounded-lg border border-white/10 p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-sm text-white">{poll.question}</div>
                            {poll.isClosed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">Closed</span>}
                          </div>
                          <div className="space-y-1.5">
                            {options.map((opt, idx) => {
                              const count = poll.votes.filter((v) => v.optionIdx === idx).length
                              const pct = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100)
                              const voted = myVotes.includes(idx)
                              return (
                                <button
                                  key={idx}
                                  disabled={poll.isClosed}
                                  onClick={async () => {
                                    await fetch(`/api/meetings/${meeting.id}/polls`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'vote', pollId: poll.id, optionIdx: idx }),
                                    })
                                    pollPolls()
                                  }}
                                  className={`w-full text-left rounded-md border px-2.5 py-1.5 text-sm transition-colors relative overflow-hidden ${
                                    voted ? 'border-primary bg-primary/20' : 'border-white/10 hover:bg-white/5'
                                  }`}
                                >
                                  <div className="absolute inset-y-0 left-0 bg-primary/20" style={{ width: `${pct}%` }} />
                                  <div className="relative flex justify-between text-white">
                                    <span className="flex items-center gap-1.5">
                                      {voted && <Check className="size-3 text-primary" />}
                                      {opt}
                                    </span>
                                    <span className="text-xs text-white/60 tabular">{count} · {pct}%</span>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                          <div className="text-[11px] text-white/40">{totalVotes} votes</div>
                        </div>
                      )
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="whiteboard" className="flex-1 min-h-0 mt-0">
                  <Whiteboard meetingId={meeting.id} userName={user?.name ?? 'Guest'} />
                </TabsContent>
              </Tabs>
        </aside>

        {/* ============================================================
         *  Floating control bar — Google Meet style
         *  - On desktop:   centered pill, all buttons in one row
         *  - On mobile:    centered pill, essential buttons + "more" overflow
         * ============================================================ */}
        <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 sm:gap-1.5 px-1 sm:px-2 py-1.5 rounded-[20px] bg-gradient-to-b from-slate-800/95 to-slate-900/95 backdrop-blur-xl border border-white/10 ring-1 ring-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] max-w-[calc(100vw-0.5rem)] overflow-x-auto no-scrollbar">
          {/* Essential controls — always visible on all screens.
              Mic/video get a red inactive state to clearly signal muted/off. */}
          <ControlBtn
            active={audioOn}
            onClick={toggleAudio}
            icon={audioOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            label={audioOn ? 'Mute' : 'Unmute'}
            inactiveClass="bg-red-600/90 hover:bg-red-500 text-white"
            dark
          />
          <ControlBtn
            active={videoOn}
            onClick={toggleVideo}
            icon={videoOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
            label={videoOn ? 'Stop video' : 'Start video'}
            inactiveClass="bg-red-600/90 hover:bg-red-500 text-white"
            dark
          />
          {/* Hand raise — visible on small+ screens (no `xs` breakpoint exists,
              the previous `hidden xs:flex` made this button invisible everywhere). */}
          <div className="hidden sm:flex">
            <ControlBtn
              active={handRaised}
              onClick={toggleHand}
              icon={<Hand className="size-5" />}
              label={handRaised ? 'Lower hand' : 'Raise hand'}
              activeClass="bg-amber-500/30 text-amber-300"
              dark
            />
          </div>
          {/* Screen share — desktop only. active=true while sharing so the
              button shows the green/emerald active style, not red. */}
          {meeting.allowScreenShare && (
            <div className="hidden sm:flex">
              <ControlBtn
                active={screenSharing}
                onClick={toggleScreenShare}
                icon={screenSharing ? <ScreenShareOff className="size-5" /> : <ScreenShare className="size-5" />}
                label={screenSharing ? 'Stop share' : 'Share'}
                activeClass="bg-emerald-500/25 text-emerald-200"
                dark
              />
            </div>
          )}
          {/* Captions — desktop only */}
          <div className="hidden sm:flex">
            <ControlBtn
              active={captionsEnabled}
              onClick={() => {
                const next = !captionsEnabled
                setCaptionsEnabled(next)
                if (next) startCaptions()
                else { try { recognitionRef.current?.stop() } catch {} }
              }}
              icon={<Captions className="size-5" />}
              label="CC"
              activeClass="bg-emerald-500/30 text-emerald-300"
              dark
            />
          </div>
          {/* Record — desktop only. active=true while recording, with red activeClass. */}
          {meeting.allowRecording && (
            <div className="hidden md:flex">
              <ControlBtn
                active={isRecording}
                onClick={toggleRecording}
                icon={<Radio className="size-5" />}
                label={isRecording ? 'Stop' : 'Record'}
                activeClass="bg-red-500/30 text-red-300"
                dark
              />
            </div>
          )}
          {/* Reactions toggle — desktop only (mobile uses the side panel) */}
          <div className="hidden sm:flex">
            <ControlBtn
              active={reactionPickerOpen}
              onClick={() => setReactionPickerOpen((v) => !v)}
              icon={<Smile className="size-5" />}
              label="React"
              activeClass="bg-white/15 text-white"
              dark
            />
          </div>

          {/* Side-panel toggles — desktop shows all, mobile shows only chat+people */}
          <div className="w-px h-8 bg-white/10 mx-0.5 hidden sm:block" />
          <div className="hidden md:flex">
            <ControlBtn
              active={sidePanelOpen && activeTab === 'translate'}
              onClick={() => {
                if (sidePanelOpen && activeTab === 'translate') setSidePanelOpen(false)
                else { setActiveTab('translate'); setSidePanelOpen(true) }
              }}
              icon={<Languages className="size-5" />}
              label="Translate"
              activeClass="bg-white/15 text-white"
              dark
            />
          </div>
          <ControlBtn
            active={sidePanelOpen && activeTab === 'chat'}
            onClick={() => {
              if (sidePanelOpen && activeTab === 'chat') setSidePanelOpen(false)
              else { setActiveTab('chat'); setSidePanelOpen(true) }
            }}
            icon={<MessageSquare className="size-5" />}
            label="Chat"
            activeClass="bg-white/15 text-white"
            dark
          />
          <ControlBtn
            active={sidePanelOpen && activeTab === 'participants'}
            onClick={() => {
              if (sidePanelOpen && activeTab === 'participants') setSidePanelOpen(false)
              else { setActiveTab('participants'); setSidePanelOpen(true) }
            }}
            icon={<Users className="size-5" />}
            label="People"
            activeClass="bg-white/15 text-white"
            dark
          />
          <div className="hidden lg:flex">
            <ControlBtn
              active={sidePanelOpen && activeTab === 'whiteboard'}
              onClick={() => {
                if (sidePanelOpen && activeTab === 'whiteboard') setSidePanelOpen(false)
                else { setActiveTab('whiteboard'); setSidePanelOpen(true) }
              }}
              icon={<PenLine className="size-5" />}
              label="Board"
              activeClass="bg-white/15 text-white"
              dark
            />
          </div>
          {/* Mobile "more" menu — opens settings which has all the extra options */}
          <div className="flex sm:hidden">
            <ControlBtn
              active={settingsOpen}
              onClick={() => setSettingsOpen(true)}
              icon={<MoreVertical className="size-5" />}
              label="More"
              activeClass="bg-white/15 text-white"
              dark
            />
          </div>
          <div className="hidden sm:flex">
            <ControlBtn
              active={settingsOpen}
              onClick={() => setSettingsOpen(true)}
              icon={<Settings className="size-5" />}
              label="Settings"
              activeClass="bg-white/15 text-white"
              dark
            />
          </div>

          <div className="w-px h-8 bg-white/10 mx-0.5" />
          <button
            onClick={leaveMeeting}
            className="group h-11 px-4 sm:px-5 ml-0.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-[12px] sm:text-[13px] font-medium flex items-center gap-1.5 sm:gap-2 transition-all duration-200 shrink-0 hover:shadow-[0_0_20px_rgba(239,68,68,0.5)] hover:scale-[1.03] active:scale-95"
          >
            <PhoneOff className="size-4 transition-transform group-hover:scale-110" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>

        {/* Reaction picker — only visible when toggled (desktop) */}
        {reactionPickerOpen && (
          <div className="hidden sm:flex absolute bottom-20 right-4 z-30 gap-1 bg-slate-800/95 backdrop-blur-md rounded-full p-1 border border-white/10 shadow-float">
            {REACTIONS.map((e) => (
              <button
                key={e}
                onClick={() => { sendReaction(e); setReactionPickerOpen(false) }}
                className="size-9 rounded-full grid place-items-center hover:bg-white/10 transition-colors text-xl"
                title="React"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Settings dialog */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        targetLang={targetLang}
        setTargetLang={setTargetLang}
        autoTranslate={autoTranslate}
        setAutoTranslate={setAutoTranslate}
        captionsEnabled={captionsEnabled}
        setCaptionsEnabled={(v) => {
          setCaptionsEnabled(v)
          if (v) startCaptions()
          else { try { recognitionRef.current?.stop() } catch {} }
        }}
        langs={LANGS}
        meeting={meeting}
      />

      {/* Share dialog */}
      <ShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        meeting={meeting}
      />

      {/* Poll dialog */}
      <CreatePollDialog
        open={pollDialogOpen}
        onOpenChange={setPollDialogOpen}
        meetingId={meeting.id}
        onCreated={() => { pollPolls(); setPollDialogOpen(false) }}
      />
    </div>
  )
}

function VideoGrid({
  tiles, onPin,
}: {
  tiles: { peerId: string; name: string; stream: MediaStream | null; isLocal: boolean; isHost: boolean; handRaised: boolean; audioOn: boolean; videoOn: boolean }[]
  onPin: (peerId: string) => void
}) {
  const count = tiles.length
  // Mobile (<=640px): cap at 2 cols so tiles stay large enough to see.
  // Desktop: original 1/2/3/4 ladder.
  const [cols, setCols] = React.useState(count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4)
  React.useEffect(() => {
    const calc = () => {
      const isMobile = window.innerWidth <= 640
      if (isMobile) {
        setCols(count <= 1 ? 1 : 2)
      } else {
        setCols(count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4)
      }
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [count])
  return (
    <div
      className="grid gap-1.5 sm:gap-2 h-full"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: '1fr' }}
    >
      {tiles.map((t) => (
        <VideoTile key={t.peerId} tile={t} onPin={() => onPin(t.peerId)} />
      ))}
    </div>
  )
}

function VideoTile({
  tile, large, onPin, onUnpin,
}: {
  tile: { peerId: string; name: string; stream: MediaStream | null; isLocal: boolean; isHost: boolean; handRaised: boolean; audioOn: boolean; videoOn: boolean; isScreenShare?: boolean }
  large?: boolean
  onPin?: () => void
  onUnpin?: () => void
}) {
  const ref = React.useRef<HTMLVideoElement>(null)
  React.useEffect(() => {
    if (ref.current && tile.stream) {
      ref.current.srcObject = tile.stream
      // Mobile autoplay policy: explicit muted=true for local (mirror),
      // for remote we MUST set muted=false AFTER srcObject is set so the
      // browser allows audio playback (some browsers ignore the muted attr
      // on the JSX if it was set before srcObject).
      if (tile.isLocal) {
        ref.current.muted = true
      } else {
        ref.current.muted = false
      }
      // Some mobile browsers (iOS Safari) require an explicit play() call
      // even with autoPlay attribute set.
      const p = ref.current.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    }
  }, [tile.stream, tile.isLocal])

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden group ${large ? 'h-full' : 'min-h-[120px]'}`}>
      {tile.videoOn && tile.stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={tile.isLocal}
          // iOS Safari: prevent PiP / AirPlay hijacking the local preview
          // — otherwise the bottom controls disappear under the iOS toolbar.
          disablePictureInPicture
          disableRemotePlayback
          className="w-full h-full object-cover"
          style={{ transform: tile.isLocal ? 'scaleX(-1)' : undefined }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="size-16 rounded-full bg-slate-700 grid place-items-center text-white text-xl font-medium">
            {tile.name.slice(0, 2).toUpperCase()}
          </div>
        </div>
      )}
      {/* Name overlay */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white text-xs">
        {!tile.audioOn && <MicOff className="size-3 text-red-400" />}
        <span>{tile.isLocal ? 'You' : tile.name}</span>
        {tile.isHost && <Crown className="size-3 text-amber-400" />}
      </div>
      {/* Hand raised */}
      {tile.handRaised && (
        <div className="absolute top-2 right-2 size-8 rounded-full bg-amber-500/90 grid place-items-center">
          <Hand className="size-4 text-white" />
        </div>
      )}
      {/* Screen share badge */}
      {tile.isScreenShare && (
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-blue-500/90 text-white text-[10px] font-medium flex items-center gap-1">
          <Monitor className="size-3" />
          Sharing screen
        </div>
      )}
      {/* Pin button */}
      <button
        onClick={onUnpin ?? onPin}
        className="absolute top-2 left-2 size-7 rounded-md bg-black/60 backdrop-blur-sm text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
        title={onUnpin ? 'Unpin' : 'Pin'}
      >
        <Pin className="size-3.5" />
      </button>
    </div>
  )
}

function MiniTile({
  tile, onClick,
}: {
  tile: { peerId: string; name: string; stream: MediaStream | null; isLocal: boolean }
  onClick: () => void
}) {
  const ref = React.useRef<HTMLVideoElement>(null)
  React.useEffect(() => {
    if (ref.current && tile.stream) {
      ref.current.srcObject = tile.stream
      if (tile.isLocal) ref.current.muted = true
    }
  }, [tile.stream, tile.isLocal])
  return (
    <button
      onClick={onClick}
      className="w-32 h-20 relative bg-black rounded-md overflow-hidden shrink-0 hover:ring-2 ring-primary"
    >
      {tile.stream ? (
        <video ref={ref} autoPlay playsInline muted={tile.isLocal} disablePictureInPicture disableRemotePlayback className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full grid place-items-center text-white text-xs">{tile.name.slice(0, 2).toUpperCase()}</div>
      )}
    </button>
  )
}

function ControlBtn({
  active, onClick, icon, label, activeClass, inactiveClass, dark,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  activeClass?: string
  // Optional override for the inactive (off) state. Pass a red style here
  // ONLY for buttons where 'off' is a warning state (e.g. mic muted, video off).
  inactiveClass?: string
  dark?: boolean
}) {
  if (dark) {
    return (
      <button
        onClick={onClick}
        className={`h-12 min-w-12 px-2.5 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-all duration-200 ${
          active
            ? `${activeClass || 'bg-white/10 hover:bg-white/15 text-white'} shadow-[0_0_12px_rgba(99,102,241,0.3)]`
            : inactiveClass || 'bg-white/5 hover:bg-white/10 text-white/80'
        }`}
        title={label}
      >
        {icon}
        {/* Always show label below icon (compact text-[10px]) so mobile
            users get a clear text label under every icon — desktop still
            uses md:inline for the original larger label beside the icon. */}
        <span className="leading-none opacity-80">{label}</span>
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`h-10 px-3 rounded-full flex items-center gap-1.5 text-sm font-medium transition-colors ${
        active
          ? activeClass || 'bg-muted hover:bg-muted/80'
          : inactiveClass || 'bg-muted/60 hover:bg-muted/80 text-foreground/80'
      }`}
      title={label}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  )
}

function ShareDialog({
  open, onOpenChange, meeting,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  meeting: MeetingItem
}) {
  const toast = useToast()
  const [link, setLink] = React.useState('')
  const [copied, setCopied] = React.useState<'link' | 'code' | null>(null)

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setLink(`${window.location.origin}/j/${meeting.joinCode}`)
    }
  }, [meeting.joinCode])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = link
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setCopied('link')
    toast.success('Link copied')
    setTimeout(() => setCopied(null), 2000)
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(meeting.joinCode)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = meeting.joinCode
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setCopied('code')
    toast.success('Code copied')
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share meeting</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Shareable link</Label>
            <div className="flex gap-2">
              <Input
                value={link}
                readOnly
                className="font-mono text-xs"
                onFocus={(e) => e.target.select()}
              />
              <Button size="icon" onClick={copyLink} className="shrink-0">
                {copied === 'link' ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Anyone with this link can join directly — no account needed.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Join code</Label>
            <div className="flex gap-2">
              <Input
                value={meeting.joinCode}
                readOnly
                className="font-mono text-lg text-center tracking-widest font-semibold"
                onFocus={(e) => e.target.select()}
              />
              <Button size="icon" variant="outline" onClick={copyCode} className="shrink-0">
                {copied === 'code' ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Share this code for users to join from the Bridge home screen.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground flex items-center gap-1.5">
              <Users className="size-3.5" />
              {meeting._count?.participants ?? 0} participant(s) in room
            </div>
            {meeting.maxParticipants && (
              <div>Max: {meeting.maxParticipants} participants</div>
            )}
            {meeting.passcode && (
              <div className="text-amber-600">Passcode required: {meeting.passcode}</div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SettingsDialog({
  open, onOpenChange, targetLang, setTargetLang, autoTranslate, setAutoTranslate,
  captionsEnabled, setCaptionsEnabled, langs, meeting,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  targetLang: string
  setTargetLang: (v: string) => void
  autoTranslate: boolean
  setAutoTranslate: (v: boolean) => void
  captionsEnabled: boolean
  setCaptionsEnabled: (v: boolean) => void
  langs: string[][]
  meeting: MeetingItem
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Meeting settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Caption (target) language</Label>
            <Select value={targetLang} onValueChange={setTargetLang}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {langs.map(([c, n]) => <SelectItem key={c} value={c}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Speaker language: {meeting.transcriptLang.toUpperCase()}
            </p>
          </div>
          <ToggleRow label="Auto-translate captions" checked={autoTranslate} onChange={setAutoTranslate} icon={<Languages className="size-4" />} />
          <ToggleRow label="Live captions" checked={captionsEnabled} onChange={setCaptionsEnabled} icon={<Captions className="size-4" />} />
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreatePollDialog({
  open, onOpenChange, meetingId, onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  meetingId: string
  onCreated: () => void
}) {
  const [question, setQuestion] = React.useState('')
  const [options, setOptions] = React.useState<string[]>(['', ''])
  const toast = useToast()

  const submit = async () => {
    if (!question.trim() || options.filter((o) => o.trim()).length < 2) {
      toast.error('Question and at least 2 options required')
      return
    }
    const r = await fetch(`/api/meetings/${meetingId}/polls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        question: question.trim(),
        options: options.filter((o) => o.trim()),
      }),
    })
    if (r.ok) {
      setQuestion(''); setOptions(['', ''])
      onCreated()
      toast.success('Poll created')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create a poll</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Question</Label>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should we discuss next?" />
          </div>
          <div className="space-y-2">
            <Label>Options</Label>
            {options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={o}
                  onChange={(e) => setOptions((prev) => prev.map((x, idx) => idx === i ? e.target.value : x))}
                  placeholder={`Option ${i + 1}`}
                />
                {options.length > 2 && (
                  <Button variant="outline" size="icon" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}>
                    ×
                  </Button>
                )}
              </div>
            ))}
            {options.length < 8 && (
              <Button variant="outline" size="sm" onClick={() => setOptions((prev) => [...prev, ''])}>
                <Plus className="size-3 mr-1" /> Add option
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Create poll</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
