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
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
import {
  KeyRound,
  Plus,
  Copy,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Activity,
  ShieldCheck,
  Eye,
  EyeOff,
  Code2,
} from 'lucide-react'
import { useToast } from '@/lib/toast-store'
import { useAuthStore } from '@/lib/auth-store'

interface Token {
  id: string
  name: string
  tokenPrefix: string
  scopes: string[]
  quotaMinutes: number
  usedMinutes: number
  requestCount: number
  rateLimitPerMin: number
  lastUsedAt: string | null
  lastUsedIp: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

const SCOPES = [
  { key: 'meetings:read', label: 'Read meetings' },
  { key: 'meetings:write', label: 'Create/update meetings' },
  { key: 'transcript:read', label: 'Read transcripts' },
  { key: 'transcript:write', label: 'Write transcripts' },
  { key: 'translate:use', label: 'Use translation API' },
  { key: 'emails:read', label: 'Read emails' },
  { key: 'emails:write', label: 'Send emails' },
  { key: 'tokens:read', label: 'List tokens' },
  { key: 'billing:read', label: 'Read billing info' },
]

export function TokensView() {
  const { user } = useAuthStore()
  const toast = useToast()
  const [tokens, setTokens] = React.useState<Token[]>([])
  const [loading, setLoading] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newTokenKey, setNewTokenKey] = React.useState<string | null>(null)
  const [revealKey, setRevealKey] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/tokens')
    const data = await r.json()
    setTokens(data.tokens ?? [])
    setLoading(false)
  }, [])

  React.useEffect(() => {
    if (user) load()
  }, [user, load])

  async function revoke(id: string) {
    await fetch(`/api/tokens?id=${id}`, { method: 'DELETE' })
    toast.success('Token revoked')
    load()
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const activeTokens = tokens.filter((t) => !t.revokedAt)
  const totalUsed = activeTokens.reduce((s, t) => s + t.usedMinutes, 0)
  const totalQuota = activeTokens.reduce((s, t) => s + t.quotaMinutes, 0)

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="size-10 rounded-lg bg-emerald-500/10 text-emerald-600 grid place-items-center">
              <KeyRound className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-semibold tabular">
                {activeTokens.length}
                <span className="text-sm text-muted-foreground font-normal">
                  {' '}
                  / {user?.apiTokensQuota ?? 5}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Active tokens
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="size-10 rounded-lg bg-amber-500/10 text-amber-600 grid place-items-center">
              <Activity className="size-5" />
            </div>
            <div className="flex-1">
              <div className="text-2xl font-semibold tabular">
                {totalUsed.toLocaleString()}
                <span className="text-sm text-muted-foreground font-normal">
                  {' '}
                  / {totalQuota.toLocaleString()}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Minutes used this period
              </div>
              <Progress value={(totalUsed / Math.max(1, totalQuota)) * 100} className="h-1 mt-2" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="size-10 rounded-lg bg-sky-500/10 text-sky-600 grid place-items-center">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-semibold tabular">AES-256</div>
              <div className="text-xs text-muted-foreground">
                Token storage encryption
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tokens list */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">API Tokens</CardTitle>
            <CardDescription className="text-xs">
              Use these tokens to authenticate API requests. Keys are shown only
              once at creation.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5 mr-1" />
            New token
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-md bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <KeyRound className="size-8 mx-auto mb-2 opacity-40" />
              No API tokens yet
            </div>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => {
                const pct = (t.usedMinutes / Math.max(1, t.quotaMinutes)) * 100
                const isRevoked = !!t.revokedAt
                return (
                  <div
                    key={t.id}
                    className={`border border-border rounded-lg p-3.5 ${
                      isRevoked ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="size-9 rounded-md bg-muted grid place-items-center shrink-0">
                        <KeyRound className="size-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{t.name}</span>
                          <code className="text-[11px] font-mono px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                            {t.tokenPrefix}••••••••
                          </code>
                          {isRevoked ? (
                            <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-500/30">
                              REVOKED
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                              ACTIVE
                            </Badge>
                          )}
                          {t.expiresAt && (
                            <Badge variant="outline" className="text-[10px]">
                              <Clock className="size-2.5 mr-0.5" />
                              Expires {new Date(t.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {t.scopes.map((s) => (
                            <Badge key={s} variant="secondary" className="text-[9px] font-mono">
                              {s}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span>
                            Usage: {t.usedMinutes.toLocaleString()} / {t.quotaMinutes.toLocaleString()} min
                          </span>
                          <Progress value={pct} className="h-1 w-32" />
                          <span>
                            Last used:{' '}
                            {t.lastUsedAt
                              ? timeAgo(t.lastUsedAt)
                              : 'never'}
                          </span>
                        </div>
                      </div>
                      {!isRevoked && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                          onClick={() => revoke(t.id)}
                          title="Revoke"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* API docs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Code2 className="size-4" />
            Quick start
          </CardTitle>
          <CardDescription className="text-xs">
            Make your first API call in under a minute
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[300px]">
            <pre className="text-xs bg-muted/50 rounded-md p-4 font-mono leading-relaxed overflow-x-auto">
{`# 1) List your meetings
curl /api/v1/meetings \\
  -H "Authorization: Bearer pm_xxxxxxxxxxxxxxxxxxxxxxxx"

# 2) Create a meeting
curl -X POST /api/v1/meetings \\
  -H "Authorization: Bearer pm_xxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Cross-team sync","targetLangs":"en,es,ja"}'

# 3) Translate text (real LLM via GLM-4.5-flash)
curl -X POST /api/v1/translate \\
  -H "Authorization: Bearer pm_xxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Welcome to the meeting","sourceLang":"en","targetLang":"es"}'
# → {"translated":"Bienvenido a la reunión","sourceLang":"en","targetLang":"es",
#    "rateLimit":{"limit":60,"remaining":59}}

# 4) Check your usage
curl /api/v1/usage \\
  -H "Authorization: Bearer pm_xxxxxxxxxxxxxxxxxxxxxxxx"

# Available scopes:
#   meetings:read    meetings:write    transcript:read   transcript:write
#   translate:use    emails:read       emails:write      tokens:read
#   billing:read

# Rate limits: per-token, configurable (default 60 req/min).
# Quota: per-token minute budget (default 1000).`}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(key) => {
          setCreateOpen(false)
          setNewTokenKey(key)
          setRevealKey(true)
          load()
        }}
      />

      {/* Reveal key dialog */}
      <Dialog open={!!newTokenKey} onOpenChange={() => setNewTokenKey(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-500" />
              Token created
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-xs">
              <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-amber-700 dark:text-amber-400">
                  Copy your token now
                </div>
                <div className="text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                  For security, this token will not be shown again. Store it in a
                  secure secrets manager.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs px-3 py-2 bg-muted rounded-md break-all">
                {revealKey ? newTokenKey : '•'.repeat(48)}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setRevealKey(!revealKey)}
              >
                {revealKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => newTokenKey && copyKey(newTokenKey)}
              >
                {copied ? (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewTokenKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateTokenDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (key: string) => void
}) {
  const [name, setName] = React.useState('')
  const [scopes, setScopes] = React.useState<string[]>([
    'meetings:read',
    'meetings:write',
    'transcript:read',
  ])
  const [quota, setQuota] = React.useState('1000')
  const [rateLimit, setRateLimit] = React.useState('60')
  const [busy, setBusy] = React.useState(false)
  const toast = useToast()

  async function create() {
    if (!name) {
      toast.error('Token name required')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          scopes,
          quotaMinutes: parseInt(quota, 10),
          rateLimitPerMin: parseInt(rateLimit, 10),
        }),
      })
      const data = await r.json()
      if (!r.ok) {
        toast.error('Failed', data.error)
        return
      }
      onCreated(data.token.fullKey)
      setName('')
      setScopes(['meetings:read', 'meetings:write', 'transcript:read'])
      setQuota('1000')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create API token</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Token name</Label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production Web App"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Scopes</Label>
            <div className="space-y-1.5">
              {SCOPES.map((s) => {
                const sel = scopes.includes(s.key)
                return (
                  <label
                    key={s.key}
                    className="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() =>
                        setScopes((prev) =>
                          sel
                            ? prev.filter((x) => x !== s.key)
                            : [...prev, s.key]
                        )
                      }
                      className="accent-emerald-500"
                    />
                    <code className="font-mono text-[11px]">{s.key}</code>
                    <span className="text-muted-foreground">{s.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-quota">Monthly quota (min)</Label>
              <Select value={quota} onValueChange={setQuota}>
                <SelectTrigger id="t-quota">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100 min</SelectItem>
                  <SelectItem value="500">500 min</SelectItem>
                  <SelectItem value="1000">1,000 min</SelectItem>
                  <SelectItem value="5000">5,000 min</SelectItem>
                  <SelectItem value="20000">20,000 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-rate">Rate limit (req/min)</Label>
              <Select value={rateLimit} onValueChange={setRateLimit}>
                <SelectTrigger id="t-rate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 / min</SelectItem>
                  <SelectItem value="60">60 / min</SelectItem>
                  <SelectItem value="120">120 / min</SelectItem>
                  <SelectItem value="300">300 / min</SelectItem>
                  <SelectItem value="600">600 / min</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy}>
            {busy ? 'Creating…' : 'Create token'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
