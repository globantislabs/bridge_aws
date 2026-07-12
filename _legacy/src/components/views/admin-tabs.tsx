'use client'

import * as React from 'react'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Plus, Pencil, Trash2, Crown, Building2, CreditCard, Users2,
  CheckCircle2, XCircle, Search, ExternalLink, Ban, RefreshCw, Sparkles,
  FlaskConical, Zap, Loader2, AlertTriangle, Languages,
  Eye, EyeOff, Copy, KeyRound, Save, Wand2,
} from 'lucide-react'
import { useToast } from '@/lib/toast-store'

/* ============================================================
 *  Plans tab — full CRUD for subscription plans
 * ============================================================ */

interface PlanRow {
  id: string
  name: string
  tier: string
  priceMonthly: number
  priceYearly: number
  meetingMinutes: number
  maxParticipants: number
  translationLangs: number
  apiTokens: number
  storageGb: number
  featuresCsv: string
  audience: string
  isActive: boolean
  isFeatured: boolean
  sortOrder: number
}

const EMPTY_PLAN: Omit<PlanRow, 'id'> = {
  name: '',
  tier: '',
  priceMonthly: 0,
  priceYearly: 0,
  meetingMinutes: 1000,
  maxParticipants: 50,
  translationLangs: 20,
  apiTokens: 5,
  storageGb: 5,
  featuresCsv: '',
  audience: 'both',
  isActive: true,
  isFeatured: false,
  sortOrder: 0,
}

export function PlansTab() {
  const toast = useToast()
  const [plans, setPlans] = React.useState<PlanRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<PlanRow | null>(null)
  const [form, setForm] = React.useState<Omit<PlanRow, 'id'>>(EMPTY_PLAN)
  const [saving, setSaving] = React.useState(false)

  const hasLoadedOnce = React.useRef(false)
  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent && !hasLoadedOnce.current) {
      setLoading(true)
    }
    try {
      const r = await fetch('/api/admin/plans')
      const d = await r.json()
      setPlans(d.plans ?? [])
      hasLoadedOnce.current = true
    } catch {
      toast.error('Failed to load plans')
    }
    setLoading(false)
  }, [toast])

  React.useEffect(() => { load() }, [load])

  function openNew() {
    setEditing(null)
    setForm(EMPTY_PLAN)
    setEditOpen(true)
  }
  function openEdit(p: PlanRow) {
    setEditing(p)
    const { id, ...rest } = p
    setForm(rest)
    setEditOpen(true)
  }

  async function save() {
    if (!form.name || !form.tier) {
      toast.error('Name and tier are required')
      return
    }
    setSaving(true)
    try {
      const url = editing
        ? `/api/admin/plans/${editing.id}`
        : '/api/admin/plans'
      const method = editing ? 'PATCH' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) {
        toast.error(d.error || 'Save failed')
        return
      }
      toast.success(editing ? 'Plan updated' : 'Plan created')
      setEditOpen(false)
      load({ silent: true })
    } catch {
      toast.error('Network error')
    }
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Delete this plan? Active subscriptions on it will block deletion.')) return
    try {
      const r = await fetch(`/api/admin/plans/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) {
        toast.error(d.error || 'Delete failed')
        return
      }
      toast.success('Plan deleted')
      load({ silent: true })
    } catch {
      toast.error('Network error')
    }
  }

  async function toggleActive(p: PlanRow) {
    const r = await fetch(`/api/admin/plans/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    })
    if (r.ok) {
      toast.success(p.isActive ? 'Plan deactivated' : 'Plan activated')
      load({ silent: true })
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="size-4 text-amber-500" />
              Subscription plans
            </CardTitle>
            <CardDescription className="text-xs">
              Plans available on the pricing page. Toggle <code>active</code> to show/hide, <code>featured</code> to highlight.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus className="size-3.5" /> New plan
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-md bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="text-right">Yearly</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Quotas</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {p.name}
                        {p.isFeatured && (
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1 text-amber-600 border-amber-500/40">
                            <Sparkles className="size-2.5 mr-0.5" />FEATURED
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell><code className="text-[11px]">{p.tier}</code></TableCell>
                    <TableCell className="text-right nums">${(p.priceMonthly / 100).toFixed(0)}</TableCell>
                    <TableCell className="text-right nums">${(p.priceYearly / 100).toFixed(0)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] uppercase">{p.audience}</Badge>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground nums">
                      {p.meetingMinutes}min · {p.maxParticipants}pax · {p.translationLangs}lang
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => toggleActive(p)}
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-1 rounded ${
                          p.isActive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {p.isActive ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                        {p.isActive ? 'Active' : 'Hidden'}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(p)}>
                          <Pencil className="size-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7 text-red-600" onClick={() => remove(p.id)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {plans.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                      No plans yet. Click <strong>New plan</strong> to create your first.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Editor dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit plan' : 'New plan'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Editing ${editing.name} (${editing.tier})`
                : 'Create a new subscription plan. Tier must be unique lowercase kebab-case.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Plan name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Pro"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tier (slug)</Label>
                <Input
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  placeholder="pro"
                  disabled={!!editing}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Monthly price (cents)</Label>
                <Input
                  type="number"
                  value={form.priceMonthly}
                  onChange={(e) => setForm({ ...form, priceMonthly: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Yearly price (cents)</Label>
                <Input
                  type="number"
                  value={form.priceYearly}
                  onChange={(e) => setForm({ ...form, priceYearly: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Meeting min</Label>
                <Input type="number" value={form.meetingMinutes}
                  onChange={(e) => setForm({ ...form, meetingMinutes: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max pax</Label>
                <Input type="number" value={form.maxParticipants}
                  onChange={(e) => setForm({ ...form, maxParticipants: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Languages</Label>
                <Input type="number" value={form.translationLangs}
                  onChange={(e) => setForm({ ...form, translationLangs: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">API tokens</Label>
                <Input type="number" value={form.apiTokens}
                  onChange={(e) => setForm({ ...form, apiTokens: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Storage (GB)</Label>
                <Input type="number" value={form.storageGb}
                  onChange={(e) => setForm({ ...form, storageGb: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sort order</Label>
                <Input type="number" value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Audience</Label>
                <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">B2B + B2C</SelectItem>
                    <SelectItem value="b2b">B2B only</SelectItem>
                    <SelectItem value="b2c">B2C only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Features (comma-separated)</Label>
              <Textarea
                rows={2}
                value={form.featuresCsv}
                onChange={(e) => setForm({ ...form, featuresCsv: e.target.value })}
                placeholder="Unlimited meetings,Live captions,Priority support"
              />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                />
                Active (visible on pricing page)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={form.isFeatured}
                  onCheckedChange={(v) => setForm({ ...form, isFeatured: v })}
                />
                Featured (highlighted)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ============================================================
 *  Subscriptions tab — list & manage all user/org subscriptions
 * ============================================================ */

interface SubRow {
  id: string
  status: string
  interval: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  createdAt: string
  user: { id: string; email: string; name: string; avatarUrl?: string | null }
  org?: { id: string; name: string; slug: string } | null
  plan: { id: string; name: string; tier: string; priceMonthly: number; priceYearly: number }
}

export function SubscriptionsTab({ plans }: { plans: PlanRow[] }) {
  const toast = useToast()
  const [subs, setSubs] = React.useState<SubRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [changingPlan, setChangingPlan] = React.useState<SubRow | null>(null)
  const [newPlanId, setNewPlanId] = React.useState<string>('')

  const hasLoadedOnce = React.useRef(false)
  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent && !hasLoadedOnce.current) {
      setLoading(true)
    }
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)
      const r = await fetch(`/api/admin/subscriptions?${params}`)
      const d = await r.json()
      setSubs(d.subscriptions ?? [])
      hasLoadedOnce.current = true
    } catch {
      toast.error('Failed to load subscriptions')
    }
    setLoading(false)
  }, [statusFilter, search, toast])

  React.useEffect(() => { load() }, [load])

  async function cancelSub(id: string) {
    if (!confirm('Cancel this subscription immediately?')) return
    const r = await fetch(`/api/admin/subscriptions/${id}`, { method: 'DELETE' })
    if (r.ok) {
      toast.success('Subscription canceled')
      load({ silent: true })
    } else {
      toast.error('Cancel failed')
    }
  }

  async function applyPlanChange() {
    if (!changingPlan || !newPlanId) return
    const r = await fetch(`/api/admin/subscriptions/${changingPlan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: newPlanId }),
    })
    if (r.ok) {
      toast.success('Plan changed — prorated invoice recorded')
      setChangingPlan(null)
      setNewPlanId('')
      load({ silent: true })
    } else {
      const d = await r.json().catch(() => ({}))
      toast.error(d.error || 'Plan change failed')
    }
  }

  async function extendPeriod(id: string, days: number) {
    const newEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    const r = await fetch(`/api/admin/subscriptions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPeriodEnd: newEnd, status: 'active' }),
    })
    if (r.ok) {
      toast.success(`Extended ${days} days`)
      load({ silent: true })
    } else {
      toast.error('Extend failed')
    }
  }

  const statusColor: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-600',
    canceled: 'bg-rose-500/10 text-rose-600',
    past_due: 'bg-amber-500/10 text-amber-600',
    trialing: 'bg-sky-500/10 text-sky-600',
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="size-4 text-emerald-500" />
            All subscriptions
          </CardTitle>
          <CardDescription className="text-xs">
            Change plans, extend periods, or cancel subscriptions across B2C and B2B accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by user email or org…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trialing">Trialing</SelectItem>
                <SelectItem value="past_due">Past due</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => load()} title="Refresh">
              <RefreshCw className="size-3.5" />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 rounded-md bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="border rounded-md max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Org</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Interval</TableHead>
                    <TableHead>Renews</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subs.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="text-xs font-medium">{s.user.name}</div>
                        <div className="text-[10px] text-muted-foreground">{s.user.email}</div>
                      </TableCell>
                      <TableCell>
                        {s.org ? (
                          <Badge variant="outline" className="text-[10px]">
                            <Building2 className="size-2.5 mr-1" />{s.org.name}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Personal</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium">{s.plan.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          ${(s.interval === 'yearly' ? s.plan.priceYearly : s.plan.priceMonthly) / 100}/{s.interval === 'yearly' ? 'yr' : 'mo'}
                        </div>
                      </TableCell>
                      <TableCell><span className="text-[11px] uppercase">{s.interval}</span></TableCell>
                      <TableCell className="text-[11px] nums">
                        {new Date(s.currentPeriodEnd).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${statusColor[s.status] || 'bg-muted'}`}>
                          {s.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={() => { setChangingPlan(s); setNewPlanId(s.plan.id) }}
                          >
                            Change plan
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={() => extendPeriod(s.id, 30)}
                            title="Extend 30 days"
                          >
                            +30d
                          </Button>
                          {s.status !== 'canceled' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-red-600"
                              onClick={() => cancelSub(s.id)}
                            >
                              <Ban className="size-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {subs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                        No subscriptions match your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change plan dialog */}
      <Dialog open={!!changingPlan} onOpenChange={(o) => !o && setChangingPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>
              Changing {changingPlan?.user.email}'s plan from{' '}
              <strong>{changingPlan?.plan.name}</strong> will issue a prorated invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <Label className="text-xs">New plan</Label>
            <Select value={newPlanId} onValueChange={setNewPlanId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — ${(p.priceMonthly / 100).toFixed(0)}/mo ({p.audience})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangingPlan(null)}>Cancel</Button>
            <Button onClick={applyPlanChange} disabled={!newPlanId}>Apply & invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ============================================================
 *  Organizations tab — B2B account management
 * ============================================================ */

interface OrgRow {
  id: string
  name: string
  slug: string
  domain: string | null
  status: string
  billingEmail: string | null
  size: string
  audience: string
  owner: { id: string; email: string; name: string }
  memberCount: number
  plan: string
  createdAt: string
}

export function OrganizationsTab({ onOpenOrg }: { onOpenOrg?: (id: string) => void }) {
  const toast = useToast()
  const [orgs, setOrgs] = React.useState<OrgRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)

  const [form, setForm] = React.useState({
    name: '',
    ownerId: '',
    domain: '',
    billingEmail: '',
    size: '1-10',
    audience: 'b2b',
  })
  const [ownerSearch, setOwnerSearch] = React.useState('')
  const [ownerResults, setOwnerResults] = React.useState<{ id: string; email: string; name: string }[]>([])
  const [saving, setSaving] = React.useState(false)

  const hasLoadedOnce = React.useRef(false)
  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent && !hasLoadedOnce.current) {
      setLoading(true)
    }
    try {
      const r = await fetch(`/api/admin/organizations?search=${encodeURIComponent(search)}`)
      const d = await r.json()
      setOrgs(d.organizations ?? [])
      hasLoadedOnce.current = true
    } catch {
      toast.error('Failed to load organizations')
    }
    setLoading(false)
  }, [search, toast])

  React.useEffect(() => { load() }, [load])

  // Debounced user search for owner picker
  React.useEffect(() => {
    if (!ownerSearch || ownerSearch.length < 3) {
      setOwnerResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/users?q=${encodeURIComponent(ownerSearch)}&limit=8`)
        const d = await r.json()
        setOwnerResults((d.users ?? []).slice(0, 8))
      } catch {}
    }, 300)
    return () => clearTimeout(t)
  }, [ownerSearch])

  async function createOrg() {
    if (!form.name || !form.ownerId) {
      toast.error('Name and owner are required')
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) {
        toast.error(d.error || 'Create failed')
        return
      }
      toast.success('Organization created')
      setCreateOpen(false)
      setForm({ name: '', ownerId: '', domain: '', billingEmail: '', size: '1-10', audience: 'b2b' })
      setOwnerSearch('')
      load({ silent: true })
    } catch {
      toast.error('Network error')
    }
    setSaving(false)
  }

  async function suspend(id: string) {
    if (!confirm('Suspend this organization? All subscriptions will be canceled.')) return
    const r = await fetch(`/api/admin/organizations/${id}`, { method: 'DELETE' })
    if (r.ok) {
      toast.success('Organization suspended')
      load({ silent: true })
    } else {
      toast.error('Suspend failed')
    }
  }

  const statusColor: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-600',
    suspended: 'bg-rose-500/10 text-rose-600',
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4 text-violet-500" />
              B2B organizations
            </CardTitle>
            <CardDescription className="text-xs">
              Each organization has its own members, billing, and shared API tokens.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="size-3.5" /> New org
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search orgs by name, slug, or domain…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => load()} title="Refresh">
              <RefreshCw className="size-3.5" />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-md bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="text-xs font-medium flex items-center gap-1.5">
                        <Building2 className="size-3 text-muted-foreground" />
                        {o.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{o.slug} · {o.size}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">{o.owner.name}</div>
                      <div className="text-[10px] text-muted-foreground">{o.owner.email}</div>
                    </TableCell>
                    <TableCell className="nums text-xs">{o.memberCount}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase">{o.plan}</Badge>
                    </TableCell>
                    <TableCell className="text-[11px]">{o.domain || '—'}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${statusColor[o.status] || 'bg-muted'}`}>
                        {o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        {onOpenOrg && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => onOpenOrg(o.id)}
                            title="Open"
                          >
                            <ExternalLink className="size-3" />
                          </Button>
                        )}
                        {o.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-red-600"
                            onClick={() => suspend(o.id)}
                            title="Suspend"
                          >
                            <Ban className="size-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {orgs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                      No organizations yet. Click <strong>New org</strong> to create one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create org dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create B2B organization</DialogTitle>
            <DialogDescription>
              The owner will be auto-added as the org&apos;s first admin member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Organization name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Acme Inc."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Owner (search by email)</Label>
              <Input
                placeholder="Type at least 3 chars…"
                value={ownerSearch}
                onChange={(e) => setOwnerSearch(e.target.value)}
              />
              {ownerResults.length > 0 && (
                <div className="border rounded-md divide-y max-h-32 overflow-y-auto">
                  {ownerResults.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setForm({ ...form, ownerId: u.id, billingEmail: form.billingEmail || u.email })
                        setOwnerSearch(`${u.name} <${u.email}>`)
                        setOwnerResults([])
                      }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-muted text-xs"
                    >
                      <div className="font-medium">{u.name}</div>
                      <div className="text-[10px] text-muted-foreground">{u.email}</div>
                    </button>
                  ))}
                </div>
              )}
              {form.ownerId && (
                <div className="text-[10px] text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="size-3" /> Owner selected
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Domain (optional)</Label>
                <Input
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  placeholder="acme.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Size</Label>
                <Select value={form.size} onValueChange={(v) => setForm({ ...form, size: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1-10</SelectItem>
                    <SelectItem value="11-50">11-50</SelectItem>
                    <SelectItem value="51-200">51-200</SelectItem>
                    <SelectItem value="201-1000">201-1000</SelectItem>
                    <SelectItem value="1000+">1000+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Billing email</Label>
              <Input
                type="email"
                value={form.billingEmail}
                onChange={(e) => setForm({ ...form, billingEmail: e.target.value })}
                placeholder="billing@acme.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createOrg} disabled={saving || !form.name || !form.ownerId}>
              {saving ? 'Creating…' : 'Create organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ============================================================
 *  API Providers tab — multi-provider key vault + monitoring
 * ============================================================ */

export interface ApiProvider {
  id: string
  type: string // 'openai_realtime' | 'openai_translate' | 'deepgram' | 'azure_speech' | 'google_stt' | 'elevenlabs' | 'whisper' | 'custom'
  label: string
  apiKey: string // masked — only first 4 + last 4 chars
  model?: string
  endpoint?: string
  isActive: boolean
  isPrimary: boolean
  lastUsedAt?: string | null
  requestCount: number
  errorCount: number
  avgLatencyMs: number
  createdAt: string
}

// Models that the OpenAI Realtime API actually supports (per their docs at
// https://platform.openai.com/docs/guides/realtime). Used to build a dropdown
// in the provider edit dialog instead of a free-text input.
const OPENAI_REALTIME_MODELS = [
  { id: 'gpt-4o-realtime-preview-2024-12-17', label: 'GPT-4o Realtime (2024-12-17) — latest, recommended', note: 'Best quality' },
  { id: 'gpt-4o-realtime-preview-2024-10-01', label: 'GPT-4o Realtime (2024-10-01)', note: 'Stable older' },
  { id: 'gpt-4o-mini-realtime-preview-2024-12-17', label: 'GPT-4o mini Realtime (2024-12-17) — cheaper, faster', note: 'Cost-efficient' },
] as const

// Models that OpenAI Chat Completions supports for translation.
const OPENAI_TRANSLATE_MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini — recommended (fast + cheap)', note: 'Default' },
  { id: 'gpt-4o', label: 'GPT-4o — higher quality, slower, ~10x cost', note: 'Premium' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', note: 'Newer' },
  { id: 'gpt-4.1', label: 'GPT-4.1', note: 'Newer flagship' },
] as const

const PROVIDER_TYPES = [
  { id: 'openai_realtime', name: 'OpenAI Realtime API', desc: 'Live voice translation (gpt-4o-realtime)', needsModel: true, defaultModel: 'gpt-4o-realtime-preview-2024-12-17', keyPrefix: 'sk-', keyHint: 'sk-proj-... or sk-...', needsEndpoint: false },
  { id: 'openai_translate', name: 'OpenAI Translate', desc: 'Text translation (gpt-4o-mini)', needsModel: true, defaultModel: 'gpt-4o-mini', keyPrefix: 'sk-', keyHint: 'sk-proj-... or sk-...', needsEndpoint: false },
  { id: 'deepgram', name: 'Deepgram', desc: 'Speech-to-text (Nova-3)', needsModel: true, defaultModel: 'nova-3', keyPrefix: '', keyHint: '32-char hex string', needsEndpoint: false },
  { id: 'azure_speech', name: 'Azure Speech', desc: 'Microsoft Cognitive Services', needsModel: false, keyPrefix: '', keyHint: '32-char hex string', needsEndpoint: true, endpointHint: 'Region (e.g. eastus) or full URL' },
  { id: 'google_stt', name: 'Google Cloud STT', desc: 'Google Cloud Speech-to-Text', needsModel: false, keyPrefix: 'AIza', keyHint: 'AIzaSy... (39 chars)', needsEndpoint: false },
  { id: 'elevenlabs', name: 'ElevenLabs', desc: 'Voice synthesis / TTS', needsModel: true, defaultModel: 'eleven_multilingual_v2', keyPrefix: '', keyHint: '32-char hex string', needsEndpoint: false },
  { id: 'whisper', name: 'OpenAI Whisper', desc: 'Speech-to-text (whisper-1)', needsModel: true, defaultModel: 'whisper-1', keyPrefix: 'sk-', keyHint: 'sk-proj-... or sk-...', needsEndpoint: false },
  { id: 'anthropic', name: 'Anthropic Claude', desc: 'LLM for chat / summary', needsModel: true, defaultModel: 'claude-3-5-sonnet-20241022', keyPrefix: 'sk-ant-', keyHint: 'sk-ant-api03-...', needsEndpoint: false },
  { id: 'custom', name: 'Custom HTTP', desc: 'Any HTTP-based API endpoint', needsModel: false, keyPrefix: '', keyHint: 'Any API key', needsEndpoint: true, endpointHint: 'https://api.example.com/v1/...' },
]

export function ApiProvidersTab() {
  const toast = useToast()
  const [providers, setProviders] = React.useState<ApiProvider[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ApiProvider | null>(null)
  const [form, setForm] = React.useState({
    type: 'openai_realtime',
    label: '',
    apiKey: '',
    model: '',
    endpoint: '',
    isActive: true,
    isPrimary: false,
  })
  const [saving, setSaving] = React.useState(false)
  const [showKey, setShowKey] = React.useState(false)
  // Per-provider test status: { [id]: 'idle' | 'testing' | 'ok' | 'fail' }
  const [testStatus, setTestStatus] = React.useState<Record<string, { state: 'idle' | 'testing' | 'ok' | 'fail'; detail?: string }>>({})
  // Pipeline test status (top-of-page "Test translation" button)
  const [pipelineTest, setPipelineTest] = React.useState<{ state: 'idle' | 'testing' | 'ok' | 'fail'; detail?: string; engine?: string }>({ state: 'idle' })

  const hasLoadedOnce = React.useRef(false)
  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    // Only flip on the loading skeleton on the FIRST load.
    // Subsequent reloads (after save/test/toggle/etc.) update silently so
    // the provider list doesn't blink the skeleton every time.
    if (!opts?.silent && !hasLoadedOnce.current) {
      setLoading(true)
    }
    try {
      const r = await fetch('/api/admin/providers')
      const d = await r.json()
      setProviders(d.providers ?? [])
      hasLoadedOnce.current = true
    } catch {
      toast.error('Failed to load API providers')
    }
    setLoading(false)
  }, [toast])

  React.useEffect(() => { load() }, [load])

  function openNew(presetType?: string) {
    const t = presetType || 'openai_realtime'
    const pt = PROVIDER_TYPES.find((p) => p.id === t)
    setEditing(null)
    setForm({
      type: t,
      label: pt?.name || '',
      apiKey: '',
      model: pt?.defaultModel || '',
      endpoint: '',
      isActive: true,
      isPrimary: (groupedRef.current[t] || []).length === 0,
    })
    setShowKey(false)
    setDialogTest({ state: 'idle' })
    setEditOpen(true)
  }
  function openEdit(p: ApiProvider) {
    setEditing(p)
    setForm({
      type: p.type,
      label: p.label,
      apiKey: '', // always blank — server keeps the secret
      model: p.model || '',
      endpoint: p.endpoint || '',
      isActive: p.isActive,
      isPrimary: p.isPrimary,
    })
    setShowKey(false)
    setDialogTest({ state: 'idle' })
    setEditOpen(true)
  }

  // Track grouped in a ref so openNew can check without needing the state value
  const groupedRef = React.useRef<Record<string, ApiProvider[]>>({})
  React.useEffect(() => {
    const g: Record<string, ApiProvider[]> = {}
    for (const p of providers) {
      if (!g[p.type]) g[p.type] = []
      g[p.type].push(p)
    }
    groupedRef.current = g
  }, [providers])

  async function saveAndOptionallyTest(runTest: boolean) {
    if (!form.label.trim()) {
      toast.error('Label required')
      return
    }
    if (!form.apiKey && !editing) {
      toast.error('API key required for new provider')
      return
    }
    setSaving(true)
    try {
      const body: any = {
        type: form.type,
        label: form.label.trim(),
        model: form.model || undefined,
        endpoint: form.endpoint || undefined,
        isActive: form.isActive,
        isPrimary: form.isPrimary,
      }
      if (form.apiKey) body.apiKey = form.apiKey
      const url = editing ? `/api/admin/providers?id=${editing.id}` : '/api/admin/providers'
      const method = editing ? 'PATCH' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      toast.success(editing ? 'Provider updated' : 'Provider added')

      // Optionally run a test against the saved key
      if (runTest && form.apiKey) {
        setDialogTest({ state: 'testing' })
        try {
          const tr = await fetch('/api/admin/providers/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: form.type,
              apiKey: form.apiKey,
              model: form.model,
              endpoint: form.endpoint,
            }),
          })
          const td = await tr.json()
          if (td.ok) {
            setDialogTest({ state: 'ok', detail: td.detail })
            toast.success(`Key valid — ${td.latencyMs}ms`)
          } else {
            setDialogTest({ state: 'fail', detail: td.error })
            toast.error(td.error || 'Test failed')
          }
        } catch (e: any) {
          setDialogTest({ state: 'fail', detail: e.message })
          toast.error(e.message)
        }
      } else {
        setEditOpen(false)
      }
      load({ silent: true })
    } catch (e: any) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function remove(p: ApiProvider) {
    if (!confirm(`Remove ${p.label}? This cannot be undone.`)) return
    const r = await fetch(`/api/admin/providers?id=${p.id}`, { method: 'DELETE' })
    if (r.ok) {
      toast.success('Provider removed')
      load({ silent: true })
    } else {
      const d = await r.json().catch(() => ({}))
      toast.error(d.error || 'Failed to remove')
    }
  }

  async function setPrimary(p: ApiProvider) {
    const r = await fetch(`/api/admin/providers?id=${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPrimary: true, isActive: true }),
    })
    if (r.ok) {
      toast.success(`${p.label} is now the primary provider`)
      load({ silent: true })
    } else {
      toast.error('Failed to set primary')
    }
  }

  async function toggleActive(p: ApiProvider) {
    const r = await fetch(`/api/admin/providers?id=${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    })
    if (r.ok) {
      toast.success(p.isActive ? 'Provider disabled' : 'Provider enabled')
      load({ silent: true })
    }
  }

  /* ─── Test an individual provider key (re-prompt for key) ───────────── */
  async function testProvider(p: ApiProvider) {
    setTestStatus((prev) => ({ ...prev, [p.id]: { state: 'testing' } }))
    try {
      // For existing primary providers, the masked key isn't usable. Re-test
      // by calling the pipeline test endpoint (GET) which uses the saved
      // key server-side and tests both realtime + translate.
      if (p.isPrimary && p.isActive && (p.type === 'openai_realtime' || p.type === 'openai_translate')) {
        const r = await fetch('/api/admin/providers/test')
        const d = await r.json()
        // GET returns { results: TestResult[] } — find the one for this provider type
        const result = d.results?.find((x: any) => x.provider === p.type)
        if (result?.ok) {
          setTestStatus((prev) => ({ ...prev, [p.id]: { state: 'ok', detail: `${result.detail} (${result.latencyMs}ms)` } }))
          toast.success(`Key valid — ${result.latencyMs}ms`)
        } else {
          setTestStatus((prev) => ({ ...prev, [p.id]: { state: 'fail', detail: result?.detail || 'Test failed' } }))
          toast.error(result?.detail || 'Test failed')
        }
        return
      }
      // For other types, ask for the key once and test directly via POST
      const key = prompt(`Enter the API key for "${p.label}" to test it.\n\n(The key is never stored client-side — this is a one-time test.)`)
      if (!key) {
        setTestStatus((prev) => ({ ...prev, [p.id]: { state: 'idle' } }))
        return
      }
      const r = await fetch('/api/admin/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: p.type,
          apiKey: key,
          model: p.model,
        }),
      })
      const d = await r.json()
      // POST returns { result: TestResult }
      const result = d.result
      if (result?.ok) {
        setTestStatus((prev) => ({ ...prev, [p.id]: { state: 'ok', detail: result.detail } }))
        toast.success(`Key valid — ${result.latencyMs}ms`)
      } else {
        setTestStatus((prev) => ({ ...prev, [p.id]: { state: 'fail', detail: result?.detail || d.error || 'Test failed' } }))
        toast.error(result?.detail || d.error || 'Test failed')
      }
    } catch (e: any) {
      setTestStatus((prev) => ({ ...prev, [p.id]: { state: 'fail', detail: e.message } }))
      toast.error(e.message || 'Test failed')
    }
  }

  /* ─── Test the key being entered in the dialog (before saving) ─────── */
  const [dialogTest, setDialogTest] = React.useState<{ state: 'idle' | 'testing' | 'ok' | 'fail'; detail?: string }>({ state: 'idle' })
  async function testDialogKey() {
    if (!form.apiKey) {
      toast.error('Enter an API key first')
      return
    }
    setDialogTest({ state: 'testing' })
    try {
      const r = await fetch('/api/admin/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type,
          apiKey: form.apiKey,
          model: form.model,
        }),
      })
      const d = await r.json()
      // POST returns { result: TestResult }
      const result = d.result
      if (result?.ok) {
        setDialogTest({ state: 'ok', detail: `${result.detail} (${result.latencyMs}ms)` })
        toast.success(`Key valid — ${result.latencyMs}ms`)
      } else {
        setDialogTest({ state: 'fail', detail: result?.detail || d.error })
        toast.error(result?.detail || d.error || 'Test failed')
      }
    } catch (e: any) {
      setDialogTest({ state: 'fail', detail: e.message })
      toast.error(e.message || 'Test failed')
    }
  }

  /* ─── Test the full translation pipeline (realtime + translate) ───── */
  async function testPipeline() {
    setPipelineTest({ state: 'testing' })
    try {
      const r = await fetch('/api/admin/providers/test')
      const d = await r.json()
      // GET returns { results: TestResult[] }
      const results: any[] = d.results || []
      const realtimeResult = results.find((x) => x.provider === 'openai_realtime')
      const translateResult = results.find((x) => x.provider === 'openai_translate')
      const allOk = results.length > 0 && results.every((x) => x.ok)
      const summary = results
        .map((x) => `${x.provider}: ${x.ok ? 'OK' : 'FAIL'}${x.latencyMs ? ` (${x.latencyMs}ms)` : ''}`)
        .join(' · ')

      if (allOk) {
        setPipelineTest({
          state: 'ok',
          engine: realtimeResult?.mode === 'live' ? 'realtime' : 'fallback',
          detail: summary,
        })
        toast.success('All providers verified')
      } else {
        const failed = results.filter((x) => !x.ok).map((x) => x.detail).join('; ')
        setPipelineTest({ state: 'fail', detail: failed || 'Some providers failed' })
        toast.error(failed || 'Some providers failed')
      }
    } catch (e: any) {
      setPipelineTest({ state: 'fail', detail: e.message })
      toast.error(e.message || 'Test failed')
    }
  }

  /* ─── Reset dialog test state when dialog opens/closes ─────────────── */
  React.useEffect(() => {
    if (!editOpen) {
      setDialogTest({ state: 'idle' })
      setShowKey(false)
    }
  }, [editOpen])

  const grouped = providers.reduce((acc, p) => {
    const k = p.type
    if (!acc[k]) acc[k] = []
    acc[k].push(p)
    return acc
  }, {} as Record<string, ApiProvider[]>)

  // Determine which features are currently powered by stored keys
  const hasRealtimeKey = (grouped['openai_realtime'] || []).some((p) => p.isPrimary && p.isActive)
  const hasTranslateKey = (grouped['openai_translate'] || []).some((p) => p.isPrimary && p.isActive)
  const currentPT = PROVIDER_TYPES.find((p) => p.id === form.type)

  return (
    <div className="space-y-4">
      {/* Status banner showing which features are powered by stored keys */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`size-9 rounded-md grid place-items-center shrink-0 ${
              hasRealtimeKey || hasTranslateKey ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
            }`}>
              <Zap className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium mb-1">Translation pipeline status</div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  {hasRealtimeKey ? (
                    <><CheckCircle2 className="size-3.5 text-emerald-600" /><span className="text-emerald-700">Live voice translation — OpenAI Realtime key active</span></>
                  ) : (
                    <><AlertTriangle className="size-3.5 text-amber-600" /><span className="text-amber-700">Live voice translation — no OpenAI Realtime key set (will fall back to browser speech recognition)</span></>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasTranslateKey ? (
                    <><CheckCircle2 className="size-3.5 text-emerald-600" /><span className="text-emerald-700">Text translation — OpenAI Translate key active</span></>
                  ) : (
                    <><CheckCircle2 className="size-3.5 text-emerald-600" /><span className="text-emerald-700">Text translation — using bundled ZAI SDK (GLM model, no key required)</span></>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={testPipeline} disabled={pipelineTest.state === 'testing'}>
                  {pipelineTest.state === 'testing' ? (
                    <><Loader2 className="size-3.5 mr-1 animate-spin" /> Testing…</>
                  ) : (
                    <><FlaskConical className="size-3.5 mr-1" /> Test translation pipeline</>
                  )}
                </Button>
                {pipelineTest.state === 'ok' && (
                  <span className="text-xs text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" />
                    <span className="truncate max-w-md">{pipelineTest.detail}</span>
                  </span>
                )}
                {pipelineTest.state === 'fail' && (
                  <span className="text-xs text-rose-600 flex items-center gap-1">
                    <XCircle className="size-3.5" />
                    <span className="truncate max-w-md">{pipelineTest.detail}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              API providers
            </CardTitle>
            <CardDescription className="text-xs">
              Add API keys from any provider — OpenAI, Deepgram, Azure, Google, ElevenLabs, Anthropic, Whisper, or custom HTTP endpoints.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => openNew()}>
            <Plus className="size-3.5 mr-1" />
            Add provider
          </Button>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="size-8 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-sm font-medium mb-1">No API providers yet</h3>
            <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
              Add your first API key to enable live translation, speech-to-text,
              and other AI-powered features across the platform.
            </p>
            <Button size="sm" onClick={() => openNew()}>
              <Plus className="size-3.5 mr-1" /> Add your first provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {PROVIDER_TYPES.map((pt) => {
            const items = grouped[pt.id] || []
            if (items.length === 0) return null
            return (
              <Card key={pt.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{pt.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {items.length} {items.length === 1 ? 'key' : 'keys'}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-[11px]">{pt.desc}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {items.map((p) => {
                      const ts = testStatus[p.id] || { state: 'idle' }
                      return (
                        <div
                          key={p.id}
                          className={`rounded-lg border p-3 flex items-center gap-3 ${
                            p.isPrimary
                              ? 'border-primary bg-primary/5'
                              : 'border-border'
                          }`}
                        >
                          <div className={`size-9 rounded-md grid place-items-center shrink-0 ${
                            p.isActive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                          }`}>
                            <Sparkles className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{p.label}</span>
                              {p.isPrimary && (
                                <Badge className="text-[9px] h-4 px-1 bg-primary/15 text-primary border border-primary/30">
                                  PRIMARY
                                </Badge>
                              )}
                              {!p.isActive && (
                                <Badge variant="secondary" className="text-[9px] h-4 px-1">
                                  INACTIVE
                                </Badge>
                              )}
                              {/* Test status badge */}
                              {ts.state === 'ok' && (
                                <Badge className="text-[9px] h-4 px-1 bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
                                  <CheckCircle2 className="size-2.5 mr-0.5" />VERIFIED
                                </Badge>
                              )}
                              {ts.state === 'fail' && (
                                <Badge className="text-[9px] h-4 px-1 bg-rose-500/15 text-rose-700 border border-rose-500/30" title={ts.detail}>
                                  <XCircle className="size-2.5 mr-0.5" />FAILED
                                </Badge>
                              )}
                              {/* "In use" badge for OpenAI types */}
                              {p.isPrimary && p.isActive && (p.type === 'openai_realtime' || p.type === 'openai_translate') && (
                                <Badge className="text-[9px] h-4 px-1 bg-violet-500/15 text-violet-700 border border-violet-500/30">
                                  IN USE
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                              <code className="font-mono">{p.apiKey}</code>
                              {p.model && <span className="ml-2">· {p.model}</span>}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                              <span className="nums">{p.requestCount.toLocaleString()} req</span>
                              {p.errorCount > 0 && (
                                <span className="text-rose-600 nums">{p.errorCount} errors</span>
                              )}
                              {p.avgLatencyMs > 0 && (
                                <span className="nums">{p.avgLatencyMs}ms avg</span>
                              )}
                              {p.lastUsedAt && (
                                <span>last used {new Date(p.lastUsedAt).toLocaleDateString()}</span>
                              )}
                            </div>
                            {ts.detail && ts.state === 'fail' && (
                              <div className="text-[10px] text-rose-600 mt-1 break-words">{ts.detail}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => testProvider(p)}
                              disabled={ts.state === 'testing'}
                              title="Test this API key"
                            >
                              {ts.state === 'testing' ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <><FlaskConical className="size-3 mr-1" />Test</>
                              )}
                            </Button>
                            {!p.isPrimary && p.isActive && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px]"
                                onClick={() => setPrimary(p)}
                                title="Make this the primary key for this type"
                              >
                                Set primary
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => toggleActive(p)}
                              title={p.isActive ? 'Disable' : 'Enable'}
                            >
                              {p.isActive ? <Ban className="size-3.5" /> : <CheckCircle2 className="size-3.5 text-emerald-600" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => openEdit(p)}
                              title="Edit"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-rose-600"
                              onClick={() => remove(p)}
                              title="Delete"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* Show available providers user hasn't added yet */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Available providers</CardTitle>
              <CardDescription className="text-[11px]">
                Click to add a new key for any of these supported providers.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {PROVIDER_TYPES.map((pt) => (
                  <button
                    key={pt.id}
                    onClick={() => openNew(pt.id)}
                    className="text-left rounded-lg border border-border p-3 hover:border-primary hover:bg-primary/5 transition-colors group"
                  >
                    <div className="text-xs font-medium mb-0.5 flex items-center gap-1.5">
                      <Plus className="size-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      {pt.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-tight">{pt.desc}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit / create dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              {editing ? 'Edit API provider' : 'Add API provider'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              API keys are stored encrypted in the database and never exposed to the client. Only the first 4 and last 4 characters are shown in the list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Provider type selector */}
            <div className="space-y-1.5">
              <Label className="text-xs">Provider type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => {
                  const pt = PROVIDER_TYPES.find((p) => p.id === v)
                  setForm({
                    ...form,
                    type: v,
                    model: pt?.defaultModel || '',
                    // Only auto-fill label if it's empty or matches a previous provider name
                    label: !form.label || PROVIDER_TYPES.some((p) => p.name === form.label)
                      ? pt?.name || form.label
                      : form.label,
                  })
                  setDialogTest({ state: 'idle' })
                }}
                disabled={!!editing}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {PROVIDER_TYPES.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentPT && (
                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3" />
                  {currentPT.desc}
                </div>
              )}
            </div>

            {/* Label */}
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="OpenAI Production"
                className="h-9"
                autoFocus
              />
              <div className="text-[10px] text-muted-foreground">
                A friendly name to identify this key. Shown only to admins.
              </div>
            </div>

            {/* API key with reveal + test */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center justify-between">
                <span>
                  API key {editing && <span className="text-muted-foreground">(leave blank to keep current)</span>}
                </span>
                {currentPT?.keyHint && (
                  <span className="text-[10px] text-muted-foreground font-normal">
                    Hint: <code className="font-mono">{currentPT.keyHint}</code>
                  </span>
                )}
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    value={form.apiKey}
                    onChange={(e) => {
                      setForm({ ...form, apiKey: e.target.value })
                      setDialogTest({ state: 'idle' })
                    }}
                    onKeyDown={(e) => {
                      // Ctrl/Cmd+Enter triggers test
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && form.apiKey) {
                        e.preventDefault()
                        testDialogKey()
                      }
                    }}
                    placeholder={editing ? '••••••••••••  (leave blank to keep current key)' : (currentPT?.keyPrefix || 'sk-...')}
                    className="h-9 font-mono text-xs pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    title={showKey ? 'Hide' : 'Show'}
                  >
                    {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={testDialogKey}
                  disabled={!form.apiKey || dialogTest.state === 'testing'}
                  title="Test this key (Ctrl+Enter)"
                >
                  {dialogTest.state === 'testing' ? (
                    <><Loader2 className="size-3.5 mr-1 animate-spin" /> Testing…</>
                  ) : dialogTest.state === 'ok' ? (
                    <><CheckCircle2 className="size-3.5 mr-1 text-emerald-600" /> Verified</>
                  ) : dialogTest.state === 'fail' ? (
                    <><XCircle className="size-3.5 mr-1 text-rose-600" /> Failed</>
                  ) : (
                    <><FlaskConical className="size-3.5 mr-1" /> Test key</>
                  )}
                </Button>
              </div>
              {/* Inline validation feedback */}
              {dialogTest.state === 'ok' && dialogTest.detail && (
                <div className="text-[11px] text-emerald-700 flex items-start gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1">
                  <CheckCircle2 className="size-3 shrink-0 mt-0.5" />
                  <span>{dialogTest.detail}</span>
                </div>
              )}
              {dialogTest.state === 'fail' && dialogTest.detail && (
                <div className="text-[11px] text-rose-600 flex items-start gap-1 bg-rose-500/10 border border-rose-500/20 rounded px-2 py-1 break-words">
                  <XCircle className="size-3 shrink-0 mt-0.5" />
                  <span className="flex-1">{dialogTest.detail}</span>
                </div>
              )}
              {currentPT?.keyPrefix && form.apiKey && !form.apiKey.startsWith(currentPT.keyPrefix) && (
                <div className="text-[10px] text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  Key doesn't start with the typical <code className="font-mono">{currentPT.keyPrefix}</code> prefix — double-check before saving.
                </div>
              )}
            </div>

            {/* Model — dropdown for openai_realtime / openai_translate, free-text otherwise */}
            {currentPT?.needsModel && (
              <div className="space-y-1.5">
                <Label className="text-xs">Model</Label>
                {currentPT.id === 'openai_realtime' ? (
                  <Select
                    value={form.model}
                    onValueChange={(v) => setForm({ ...form, model: v })}
                  >
                    <SelectTrigger className="h-9 text-xs font-mono">
                      <SelectValue placeholder="Pick a Realtime model" />
                    </SelectTrigger>
                    <SelectContent>
                      {OPENAI_REALTIME_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <span className="font-mono text-xs">{m.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : currentPT.id === 'openai_translate' ? (
                  <Select
                    value={form.model}
                    onValueChange={(v) => setForm({ ...form, model: v })}
                  >
                    <SelectTrigger className="h-9 text-xs font-mono">
                      <SelectValue placeholder="Pick a chat model" />
                    </SelectTrigger>
                    <SelectContent>
                      {OPENAI_TRANSLATE_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <span className="font-mono text-xs">{m.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder={currentPT.defaultModel || 'model-name'}
                    className="h-9 font-mono text-xs"
                  />
                )}
                <div className="text-[10px] text-muted-foreground">
                  Default: <code className="font-mono">{currentPT.defaultModel}</code>
                </div>
              </div>
            )}

            {/* Endpoint (if applicable) */}
            {currentPT?.needsEndpoint && (
              <div className="space-y-1.5">
                <Label className="text-xs">Endpoint / Region</Label>
                <Input
                  value={form.endpoint}
                  onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                  placeholder={currentPT.endpointHint || 'https://api.example.com/v1/...'}
                  className="h-9 font-mono text-xs"
                />
                <div className="text-[10px] text-muted-foreground">
                  {currentPT.endpointHint || 'Full URL or region identifier'}
                </div>
              </div>
            )}

            {/* Active / Primary switches */}
            <div className="flex items-center gap-4 pt-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch
                  checked={form.isPrimary}
                  onCheckedChange={(v) => setForm({ ...form, isPrimary: v })}
                />
                Primary for this type
              </label>
            </div>

            {/* Info banner when primary OpenAI provider */}
            {form.isPrimary && (form.type === 'openai_realtime' || form.type === 'openai_translate') && (
              <div className="text-[11px] text-violet-700 bg-violet-500/10 border border-violet-500/20 rounded p-2 flex items-start gap-1.5">
                <Wand2 className="size-3 shrink-0 mt-0.5" />
                <div className="flex-1">
                  Setting this as primary will automatically activate it for{' '}
                  <strong>{form.type === 'openai_realtime' ? 'live voice translation' : 'text translation'}</strong>{' '}
                  across the platform. Other providers of the same type will be demoted.
                </div>
              </div>
            )}

            {/* Tip for OpenAI keys */}
            {form.type === 'openai_realtime' && (
              <div className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded p-2 flex items-start gap-1.5">
                <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                <div className="flex-1">
                  OpenAI Realtime requires a billing-enabled account with at least $5 in credits.
                  Get a key from <code className="font-mono">platform.openai.com/api-keys</code>.
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              variant="outline"
              onClick={() => saveAndOptionallyTest(true)}
              disabled={saving || (!form.apiKey && !editing)}
              title="Save and run a test against the key"
            >
              {saving ? (
                <><Loader2 className="size-3.5 mr-1 animate-spin" /> Saving…</>
              ) : (
                <><Save className="size-3.5 mr-1" /> Save & Test</>
              )}
            </Button>
            <Button
              onClick={() => saveAndOptionallyTest(false)}
              disabled={saving || (!form.apiKey && !editing)}
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add provider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ============================================================
 *  Usage tab — per-user usage monitoring table
 * ============================================================ */

export function UsageTab() {
  const toast = useToast()
  const [rows, setRows] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [sortBy, setSortBy] = React.useState<'minutes' | 'tokens' | 'requests' | 'errors'>('minutes')

  const hasLoadedOnce = React.useRef(false)
  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent && !hasLoadedOnce.current) {
      setLoading(true)
    }
    try {
      const r = await fetch('/api/admin/usage')
      const d = await r.json()
      setRows(d.usage ?? [])
      hasLoadedOnce.current = true
    } catch {
      toast.error('Failed to load usage')
    }
    setLoading(false)
  }, [toast])

  React.useEffect(() => { load() }, [load])

  const filtered = rows
    .filter((u) => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0))

  const totals = rows.reduce(
    (acc, u) => ({
      minutes: acc.minutes + (u.minutes || 0),
      tokens: acc.tokens + (u.tokens || 0),
      requests: acc.requests + (u.requests || 0),
      errors: acc.errors + (u.errors || 0),
    }),
    { minutes: 0, tokens: 0, requests: 0, errors: 0 }
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: 'Total minutes', value: totals.minutes.toLocaleString(), tint: 'text-primary' },
          { label: 'Total tokens', value: totals.tokens.toLocaleString(), tint: 'text-emerald-600' },
          { label: 'Total API requests', value: totals.requests.toLocaleString(), tint: 'text-violet-600' },
          { label: 'Total errors', value: totals.errors.toLocaleString(), tint: 'text-rose-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className={`text-2xl font-medium nums ${s.tint}`}>{s.value}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users2 className="size-4" />
              Per-user usage
            </CardTitle>
            <CardDescription className="text-xs">
              Monitor API consumption per user across all providers.
            </CardDescription>
          </div>
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-[220px] pl-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Plan</TableHead>
                  <TableHead className="text-xs cursor-pointer text-right" onClick={() => setSortBy('minutes')}>
                    Minutes {sortBy === 'minutes' && '↓'}
                  </TableHead>
                  <TableHead className="text-xs cursor-pointer text-right" onClick={() => setSortBy('tokens')}>
                    Tokens {sortBy === 'tokens' && '↓'}
                  </TableHead>
                  <TableHead className="text-xs cursor-pointer text-right" onClick={() => setSortBy('requests')}>
                    Requests {sortBy === 'requests' && '↓'}
                  </TableHead>
                  <TableHead className="text-xs cursor-pointer text-right" onClick={() => setSortBy('errors')}>
                    Errors {sortBy === 'errors' && '↓'}
                  </TableHead>
                  <TableHead className="text-xs text-right">Last active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="size-7">
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {u.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">{u.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">{u.plan}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right nums">{(u.minutes || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right nums">{(u.tokens || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right nums">{(u.requests || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right nums">
                      <span className={u.errors > 0 ? 'text-rose-600' : 'text-muted-foreground'}>
                        {(u.errors || 0).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">
                      {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                      No usage data yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
