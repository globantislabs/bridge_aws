'use client'

import * as React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  User, Globe, Bell, Shield, Camera, Mail, Video, Save,
  Key, Monitor, Lock, Check, Building, Clock3,
} from 'lucide-react'
import { useToast } from '@/lib/toast-store'
import { useAuthStore } from '@/lib/auth-store'

const LANGS: [string, string][] = [
  ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'],
  ['it', 'Italian'], ['pt', 'Portuguese'], ['ja', 'Japanese'], ['zh', 'Chinese'],
  ['hi', 'Hindi'], ['ar', 'Arabic'], ['ru', 'Russian'], ['ko', 'Korean'],
  ['vi', 'Vietnamese'], ['th', 'Thai'], ['nl', 'Dutch'], ['sv', 'Swedish'],
]

const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney']

export function SettingsView() {
  const { user, refresh } = useAuthStore()
  const toast = useToast()
  const [saving, setSaving] = React.useState<null | 'profile' | 'prefs' | 'security'>(null)

  // Profile state
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [bio, setBio] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [company, setCompany] = React.useState('')
  const [timezone, setTimezone] = React.useState('UTC')
  const [locale, setLocale] = React.useState('en')
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null)

  // Preferences state
  const [autoTranslate, setAutoTranslate] = React.useState(true)
  const [showCaptions, setShowCaptions] = React.useState(true)
  const [captionSize, setCaptionSize] = React.useState('medium')
  const [preferredLangs, setPreferredLangs] = React.useState<string[]>(['en', 'es', 'fr', 'de'])
  const [notifEmail, setNotifEmail] = React.useState(true)
  const [notifPush, setNotifPush] = React.useState(true)
  const [notifMeeting, setNotifMeeting] = React.useState(true)
  const [notifWeekly, setNotifWeekly] = React.useState(false)
  const [density, setDensity] = React.useState('comfortable')
  const [videoMirror, setVideoMirror] = React.useState(true)
  const [audioEcho, setAudioEcho] = React.useState(true)
  const [audioNoise, setAudioNoise] = React.useState(true)
  const [videoQuality, setVideoQuality] = React.useState('auto')

  // Security state
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')

  // Load settings
  React.useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setName(data.user.name ?? '')
          setEmail(data.user.email ?? '')
          setBio(data.user.bio ?? '')
          setTitle(data.user.title ?? '')
          setCompany(data.user.company ?? '')
          setTimezone(data.user.timezone ?? 'UTC')
          setLocale(data.user.locale ?? 'en')
          setAvatarUrl(data.user.avatarUrl ?? null)
        }
        if (data.preferences) {
          const p = data.preferences
          setAutoTranslate(p.autoTranslate)
          setShowCaptions(p.showCaptions)
          setCaptionSize(p.captionSize)
          setPreferredLangs(p.preferredLangs.split(',').filter(Boolean))
          setNotifEmail(p.notifEmail)
          setNotifPush(p.notifPush)
          setNotifMeeting(p.notifMeeting)
          setNotifWeekly(p.notifWeekly)
          setDensity(p.density)
          setVideoMirror(p.videoMirror)
          setAudioEcho(p.audioEcho)
          setAudioNoise(p.audioNoise)
          setVideoQuality(p.videoQuality)
        }
      })
      .catch(() => {})
  }, [])

  async function saveProfile() {
    setSaving('profile')
    try {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, bio, title, company, timezone, locale }),
      })
      const d = await r.json()
      if (!r.ok) {
        toast.error('Failed', d.error)
        return
      }
      toast.success('Profile saved')
      refresh()
    } finally {
      setSaving(null)
    }
  }

  async function savePrefs() {
    setSaving('prefs')
    try {
      const r = await fetch('/api/settings/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoTranslate, showCaptions, captionSize,
          preferredLangs: preferredLangs.join(','),
          notifEmail, notifPush, notifMeeting, notifWeekly,
          density, videoMirror, audioEcho, audioNoise, videoQuality,
        }),
      })
      if (!r.ok) {
        const d = await r.json()
        toast.error('Failed', d.error)
        return
      }
      toast.success('Preferences saved')
    } finally {
      setSaving(null)
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSaving('security')
    try {
      const r = await fetch('/api/settings/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const d = await r.json()
      if (!r.ok) {
        toast.error('Failed', d.error)
        return
      }
      toast.success('Password changed')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1000px] mx-auto">
      {/* Profile */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="size-4" />
            Profile
          </CardTitle>
          <CardDescription className="text-xs">
            Update your personal information — saved to your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="size-full object-cover rounded-full" />
              ) : (
                <AvatarFallback className="bg-emerald-500/15 text-emerald-700 text-lg">
                  {name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="space-y-1">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-muted/40 cursor-pointer text-xs">
                <Camera className="size-3.5" />
                Upload photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const reader = new FileReader()
                    reader.onload = () => setAvatarUrl(reader.result as string)
                    reader.readAsDataURL(f)
                  }}
                />
              </label>
              <div className="text-[11px] text-muted-foreground">
                JPG, PNG or GIF. Max size 2MB.
              </div>
            </div>
          </div>
          <Separator />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-name">Full name</Label>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-email">Email</Label>
              <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-title"><span className="inline-flex items-center gap-1"><Key className="size-3" /> Job title</span></Label>
              <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product Manager" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-company"><span className="inline-flex items-center gap-1"><Building className="size-3" /> Company</span></Label>
              <Input id="s-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-tz"><span className="inline-flex items-center gap-1"><Clock3 className="size-3" /> Timezone</span></Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="s-tz"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-bio">Bio</Label>
            <Textarea id="s-bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell others about yourself…" className="min-h-[80px]" />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={saving === 'profile'}>
              <Save className="size-3.5 mr-1.5" />
              {saving === 'profile' ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Language & Translation */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="size-4" />
            Language & Translation
          </CardTitle>
          <CardDescription className="text-xs">
            Configure your preferred languages and translation behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Primary language</Label>
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {LANGS.map(([c, n]) => <SelectItem key={c} value={c}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Preferred translation languages</Label>
            <div className="flex flex-wrap gap-1.5">
              {LANGS.map(([c, n]) => {
                const active = preferredLangs.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setPreferredLangs((prev) =>
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
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Auto-translate incoming speech</div>
                <div className="text-xs text-muted-foreground">
                  Automatically translate other participants' speech to your primary language
                </div>
              </div>
              <Switch checked={autoTranslate} onCheckedChange={setAutoTranslate} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Show captions by default</div>
                <div className="text-xs text-muted-foreground">
                  Display live captions when joining meetings
                </div>
              </div>
              <Switch checked={showCaptions} onCheckedChange={setShowCaptions} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Caption size</div>
                <div className="text-xs text-muted-foreground">
                  Adjust caption text size for readability
                </div>
              </div>
              <Select value={captionSize} onValueChange={setCaptionSize}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="size-4" />
            Notifications
          </CardTitle>
          <CardDescription className="text-xs">
            Choose what to be notified about
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'Email notifications', desc: 'Receive emails about your account', value: notifEmail, setter: setNotifEmail, icon: Mail },
            { label: 'Push notifications', desc: 'Browser push for new messages and meetings', value: notifPush, setter: setNotifPush, icon: Monitor },
            { label: 'Meeting reminders', desc: 'Get notified 10 min before meetings', value: notifMeeting, setter: setNotifMeeting, icon: Video },
            { label: 'Weekly digest', desc: 'Summary of activity every Monday', value: notifWeekly, setter: setNotifWeekly, icon: Mail },
          ].map((n) => {
            const Icon = n.icon
            return (
              <div key={n.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-md bg-muted grid place-items-center">
                    <Icon className="size-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{n.label}</div>
                    <div className="text-xs text-muted-foreground">{n.desc}</div>
                  </div>
                </div>
                <Switch checked={n.value} onCheckedChange={n.setter} />
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Audio / Video */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Video className="size-4" />
            Audio & Video
          </CardTitle>
          <CardDescription className="text-xs">
            Default media settings for meetings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <div className="text-sm font-medium">Mirror my video</div>
              <div className="text-xs text-muted-foreground">Show your own video as mirrored</div>
            </div>
            <Switch checked={videoMirror} onCheckedChange={setVideoMirror} />
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <div className="text-sm font-medium">Echo cancellation</div>
              <div className="text-xs text-muted-foreground">Reduce echo from speakers</div>
            </div>
            <Switch checked={audioEcho} onCheckedChange={setAudioEcho} />
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <div className="text-sm font-medium">Noise suppression</div>
              <div className="text-xs text-muted-foreground">Filter background noise</div>
            </div>
            <Switch checked={audioNoise} onCheckedChange={setAudioNoise} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium">Video quality</div>
              <div className="text-xs text-muted-foreground">Default camera resolution</div>
            </div>
            <Select value={videoQuality} onValueChange={setVideoQuality}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="360">360p</SelectItem>
                <SelectItem value="720">720p</SelectItem>
                <SelectItem value="1080">1080p</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Appearance (settings) */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="size-4" />
            Appearance
          </CardTitle>
          <CardDescription className="text-xs">
            Personalize your workspace density
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium">Layout density</div>
              <div className="text-xs text-muted-foreground">Compact mode shows more content per screen</div>
            </div>
            <Select value={density} onValueChange={setDensity}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Save preferences button */}
      <div className="flex justify-end">
        <Button onClick={savePrefs} disabled={saving === 'prefs'} size="lg">
          <Save className="size-4 mr-1.5" />
          {saving === 'prefs' ? 'Saving preferences…' : 'Save preferences'}
        </Button>
      </div>

      {/* Security */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="size-4" />
            Security
          </CardTitle>
          <CardDescription className="text-xs">
            Change your password. Sessions remain active after change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="s-cp">Current password</Label>
            <Input id="s-cp" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-np">New password</Label>
              <Input id="s-np" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-cp2">Confirm new password</Label>
              <Input id="s-cp2" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground">
            <Lock className="size-3 inline mr-1" />
            Minimum 8 characters. We recommend a mix of letters, numbers, and symbols.
          </div>
          <div className="flex justify-end">
            <Button onClick={changePassword} disabled={saving === 'security' || !currentPassword || !newPassword}>
              {saving === 'security' ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Two-factor authentication */}
      <TwoFactorCard />
    </div>
  )
}

/* ============================================================
 *  Two-factor auth (TOTP) — setup, verify, disable
 * ============================================================ */
function TwoFactorCard() {
  const toast = useToast()
  const [status, setStatus] = React.useState<'loading' | 'off' | 'on' | 'setup'>('loading')
  const [qr, setQr] = React.useState<string | null>(null)
  const [secret, setSecret] = React.useState<string | null>(null)
  const [backupCodes, setBackupCodes] = React.useState<string[]>([])
  const [verifyCode, setVerifyCode] = React.useState('')
  const [disablePassword, setDisablePassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  // Check current 2FA status on mount
  React.useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/auth/2fa/status', { cache: 'no-store' })
        if (r.ok) {
          const d = await r.json()
          setStatus(d.enabled ? 'on' : 'off')
        } else {
          setStatus('off')
        }
      } catch {
        setStatus('off')
      }
    })()
  }, [])

  async function startSetup() {
    setBusy(true)
    try {
      const r = await fetch('/api/auth/2fa/setup', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      setQr(d.qr)
      setSecret(d.secret)
      setBackupCodes(d.backupCodes || [])
      setStatus('setup')
    } catch (e: any) {
      toast.error('Could not start 2FA setup', e.message)
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    if (!verifyCode.trim()) return
    setBusy(true)
    try {
      const r = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Invalid code')
      toast.success('2FA enabled', 'You will need a code from your authenticator app on every login.')
      setStatus('on')
      setQr(null)
      setSecret(null)
      setBackupCodes([])
      setVerifyCode('')
    } catch (e: any) {
      toast.error('Verification failed', e.message)
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    if (!disablePassword) return
    setBusy(true)
    try {
      const r = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePassword }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      toast.success('2FA disabled')
      setStatus('off')
      setDisablePassword('')
    } catch (e: any) {
      toast.error('Could not disable 2FA', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Key className="size-4" />
          Two-factor authentication
          {status === 'on' && (
            <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 h-5 text-[10px]">
              ENABLED
            </Badge>
          )}
          {status === 'off' && (
            <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
              OFF
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Add a second factor (TOTP code from an authenticator app like Google Authenticator or 1Password). Required on every login after your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'loading' && (
          <div className="text-xs text-muted-foreground">Checking…</div>
        )}

        {status === 'off' && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              No 2FA configured. We strongly recommend enabling it for admin accounts.
            </div>
            <Button onClick={startSetup} disabled={busy}>
              Enable 2FA
            </Button>
          </div>
        )}

        {status === 'setup' && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              {qr && (
                <div className="shrink-0">
                  <img src={qr} alt="2FA QR code" className="size-44 rounded-lg border" />
                </div>
              )}
              <div className="space-y-2 flex-1 min-w-0">
                <div className="text-sm font-medium">Scan this QR with your authenticator app</div>
                <div className="text-xs text-muted-foreground">
                  Or enter this secret manually:
                </div>
                <code className="block text-[11px] bg-muted px-2 py-1.5 rounded break-all">
                  {secret}
                </code>
                <div className="pt-2">
                  <Label className="text-xs">Enter the 6-digit code from your app</Label>
                  <Input
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && verifyCode.length === 6 && verify()}
                    placeholder="123456"
                    className="font-mono tracking-widest text-center text-lg mt-1"
                    inputMode="numeric"
                  />
                </div>
                <Button onClick={verify} disabled={busy || verifyCode.length !== 6} size="sm" className="mt-2">
                  {busy ? 'Verifying…' : 'Confirm & enable'}
                </Button>
              </div>
            </div>
            {backupCodes.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1.5">
                  Backup codes — save these now (shown only once)
                </div>
                <div className="grid grid-cols-2 gap-1 font-mono text-xs">
                  {backupCodes.map((c) => (
                    <div key={c} className="bg-background px-2 py-1 rounded">{c}</div>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground mt-2">
                  Each code can be used once if you lose access to your authenticator.
                </div>
              </div>
            )}
          </div>
        )}

        {status === 'on' && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              2FA is active. To disable, confirm your password below.
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Your account password"
                autoComplete="current-password"
                className="max-w-xs"
              />
              <Button variant="outline" onClick={disable} disabled={busy || !disablePassword}>
                {busy ? 'Disabling…' : 'Disable 2FA'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
