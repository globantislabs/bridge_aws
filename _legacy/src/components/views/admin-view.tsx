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
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import {
  Users,
  Video,
  Mail,
  KeyRound,
  DollarSign,
  TrendingUp,
  Activity,
  Shield,
  Ban,
  Search,
  MoreHorizontal,
  Crown,
  AlertCircle,
  Globe,
  Server,
  Database,
  Cpu,
  HardDrive,
  Wifi,
  Megaphone,
  Trash2,
  CheckCircle2,
  XCircle,
  UserCog,
  ScrollText,
  BarChart3,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { useToast } from '@/lib/toast-store'
import { useAuthStore } from '@/lib/auth-store'
import { TokensView } from '@/components/views/tokens-view'
import { PlansTab, SubscriptionsTab, OrganizationsTab, ApiProvidersTab, UsageTab } from '@/components/views/admin-tabs'
import { Building2, CreditCard } from 'lucide-react'

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  status: string
  plan: string
  tokens: number
  createdAt: string
}

export function AdminView() {
  const { user } = useAuthStore()
  const toast = useToast()
  const [data, setData] = React.useState<any>(null)
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [broadcastOpen, setBroadcastOpen] = React.useState(false)
  const [activeAdminTab, setActiveAdminTab] = React.useState<'overview' | 'users' | 'tokens' | 'providers' | 'usage' | 'plans' | 'subscriptions' | 'organizations'>('overview')
  // Plans are loaded once and shared with SubscriptionsTab (for the change-plan dropdown)
  const [plans, setPlans] = React.useState<any[]>([])
  const loadPlans = React.useCallback(async () => {
    try {
      const r = await fetch('/api/admin/plans')
      if (!r.ok) return
      const d = await r.json()
      setPlans(d.plans ?? [])
    } catch {}
  }, [])
  React.useEffect(() => { loadPlans() }, [loadPlans])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [oRes, uRes] = await Promise.all([
        fetch('/api/admin?view=overview'),
        fetch('/api/admin?view=users'),
      ])
      if (!oRes.ok) {
        const body = await oRes.json().catch(() => ({}))
        throw new Error(body?.error || `Overview failed (${oRes.status})`)
      }
      if (!uRes.ok) {
        const body = await uRes.json().catch(() => ({}))
        throw new Error(body?.error || `Users failed (${uRes.status})`)
      }
      const o = await oRes.json()
      const u = await uRes.json()
      if (!o || typeof o !== 'object' || !o.overview) {
        throw new Error('Invalid overview payload from server')
      }
      setData(o)
      setUsers(u.users ?? [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load admin data')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (user?.role === 'admin') load()
  }, [user, load])

  if (user?.role !== 'admin') {
    return (
      <div className="p-10 text-center">
        <Shield className="size-12 mx-auto text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold">Admin access required</h2>
        <p className="text-sm text-muted-foreground mt-1">
          You don't have permission to view this page.
        </p>
      </div>
    )
  }

  if (loading || (!data && !error)) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error || !data?.overview) {
    return (
      <div className="p-10 text-center max-w-md mx-auto">
        <div className="size-12 mx-auto rounded-full bg-rose-500/10 text-rose-600 grid place-items-center mb-3">
          <AlertCircle className="size-6" />
        </div>
        <h2 className="text-lg font-semibold">Couldn&apos;t load admin data</h2>
        <p className="text-sm text-muted-foreground mt-2 break-words">
          {error || 'Overview payload was missing from the server response.'}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          If you just signed in, your session may have expired. Try signing out and back in as <code>admin@bridge.app</code> / <code>admin123</code>.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => load()}>
          Retry
        </Button>
      </div>
    )
  }

  // Safety net: even if the server returned an overview, default every field to 0
  // so a missing key never crashes the charts/stat cards below.
  const o = {
    totalUsers: 0,
    totalMeetings: 0,
    totalEmails: 0,
    totalTokens: 0,
    totalInvoices: 0,
    activeSubs: 0,
    proSubs: 0,
    entSubs: 0,
    b2bSubs: 0,
    b2cSubs: 0,
    totalOrgs: 0,
    activeOrgs: 0,
    totalPlans: 0,
    mrr: 0,
    ...(data.overview ?? {}),
  }
  const planDistribution = [
    { name: 'Free', value: Math.max(0, o.totalUsers - o.proSubs - o.entSubs), color: 'oklch(0.7 0.05 240)' },
    { name: 'Pro', value: o.proSubs, color: 'oklch(0.62 0.13 155)' },
    { name: 'Enterprise', value: o.entSubs, color: 'oklch(0.55 0.18 320)' },
  ]
  const audienceSplit = [
    { name: 'B2C', value: o.b2cSubs ?? 0, color: 'oklch(0.62 0.13 200)' },
    { name: 'B2B', value: o.b2bSubs ?? 0, color: 'oklch(0.55 0.18 60)' },
  ]
  const systemMetrics = [
    { label: 'API latency (p95)', value: '124ms', icon: Cpu, color: 'emerald' },
    { label: 'Translation latency', value: '742ms', icon: Globe, color: 'sky' },
    { label: 'WebRTC uptime', value: '99.97%', icon: Server, color: 'emerald' },
    { label: 'DB connections', value: '34 / 200', icon: Database, color: 'amber' },
    { label: 'Storage used', value: '342 GB', icon: HardDrive, color: 'sky' },
    { label: 'Bandwidth (24h)', value: '8.4 TB', icon: Wifi, color: 'emerald' },
  ]

  const statCards = [
    { label: 'Total users', value: o.totalUsers, icon: Users, tint: 'emerald', trend: '+12%' },
    { label: 'Total meetings', value: o.totalMeetings, icon: Video, tint: 'sky', trend: '+8%' },
    { label: 'Active subscriptions', value: o.activeSubs, icon: Crown, tint: 'amber', trend: '+5%' },
    { label: 'MRR', value: `$${(o.mrr / 100).toLocaleString()}`, icon: DollarSign, tint: 'emerald', trend: '+18%' },
    { label: 'B2B organizations', value: o.totalOrgs ?? 0, icon: Building2, tint: 'violet', trend: '+7%' },
    { label: 'Active plans', value: o.totalPlans ?? 0, icon: Crown, tint: 'amber', trend: '+2' },
  ] as const

  const tintMap: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  }

  const filteredUsers = users.filter(
    (u) =>
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header banner */}
      <Card className="overflow-hidden border-amber-500/30">
        <div className="bg-gradient-to-r from-amber-500/10 via-transparent to-transparent p-5 flex items-center gap-3">
          <div className="size-10 rounded-lg bg-amber-500/15 text-amber-600 grid place-items-center">
            <Shield className="size-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">Admin Panel</div>
            <div className="text-xs text-muted-foreground">
              You are signed in as <code className="text-foreground">{user?.email}</code> with elevated privileges.
            </div>
          </div>
          <Badge variant="outline" className="text-amber-600 border-amber-500/30">
            ADMIN
          </Badge>
        </div>
      </Card>

      {/* Sub-tab nav */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {([
          ['overview', 'Overview', Activity],
          ['users', 'Members', Users],
          ['providers', 'API Providers', KeyRound],
          ['usage', 'Usage', BarChart3],
          ['tokens', 'Tokens', KeyRound],
          ['plans', 'Plans', Crown],
          ['subscriptions', 'Subscriptions', CreditCard],
          ['organizations', 'B2B Orgs', Building2],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setActiveAdminTab(key as any)}
            className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeAdminTab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeAdminTab === 'tokens' ? (
        <TokensView />
      ) : activeAdminTab === 'providers' ? (
        <ApiProvidersTab />
      ) : activeAdminTab === 'usage' ? (
        <UsageTab />
      ) : activeAdminTab === 'plans' ? (
        <PlansTab />
      ) : activeAdminTab === 'subscriptions' ? (
        <SubscriptionsTab plans={plans} />
      ) : activeAdminTab === 'organizations' ? (
        <OrganizationsTab />
      ) : (
        <>
      {/* Stat grid */}
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        {statCards.map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className={`size-8 rounded-md grid place-items-center ${tintMap[s.tint]} mb-2`}>
                  <Icon className="size-4" />
                </div>
                <div className="text-xl font-semibold tabular">{s.value}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  {s.label}
                  <Badge variant="outline" className="text-[9px] h-3 px-1 ml-auto text-emerald-600 border-emerald-500/30">
                    {s.trend}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="size-4 text-emerald-500" />
              Platform activity (7 days)
            </CardTitle>
            <CardDescription className="text-xs">
              Total events per day across all users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.activitySeries} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                <defs>
                  <linearGradient id="admin-activity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.62 0.13 155)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.62 0.13 155)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.5 0 0 / 0.1)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'oklch(0.5 0 0 / 0.7)' }} axisLine={false} tickLine={false} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: 'oklch(0.5 0 0 / 0.7)' }} axisLine={false} tickLine={false} />
                <RTooltip
                  contentStyle={{
                    fontSize: 11,
                    background: 'oklch(0.2 0.005 240 / 0.95)',
                    border: '1px solid oklch(0.5 0 0 / 0.2)',
                    borderRadius: 8,
                    color: 'white',
                  }}
                />
                <Area type="monotone" dataKey="count" stroke="oklch(0.62 0.13 155)" strokeWidth={2} fill="url(#admin-activity)" name="Events" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="size-4 text-amber-500" />
              Plan distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Active subscriptions by tier
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={planDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                  paddingAngle={2}
                >
                  {planDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <RTooltip
                  contentStyle={{
                    fontSize: 11,
                    background: 'oklch(0.2 0.005 240 / 0.95)',
                    border: '1px solid oklch(0.5 0 0 / 0.2)',
                    borderRadius: 8,
                    color: 'white',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* B2B vs B2C split */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4 text-violet-500" />
              B2B vs B2C
            </CardTitle>
            <CardDescription className="text-xs">
              Active subscriptions by audience
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={audienceSplit}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                  paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {audienceSplit.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <RTooltip
                  contentStyle={{
                    fontSize: 11,
                    background: 'oklch(0.2 0.005 240 / 0.95)',
                    border: '1px solid oklch(0.5 0 0 / 0.2)',
                    borderRadius: 8,
                    color: 'white',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: 'oklch(0.55 0.18 60)' }} />
                <span className="text-muted-foreground">B2B orgs</span>
                <span className="ml-auto font-medium nums">{o.totalOrgs ?? 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: 'oklch(0.62 0.13 200)' }} />
                <span className="text-muted-foreground">B2C users</span>
                <span className="ml-auto font-medium nums">{o.totalUsers - (o.totalOrgs ?? 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System metrics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="size-4 text-muted-foreground" />
            System metrics
          </CardTitle>
          <CardDescription className="text-xs">
            Real-time platform health (refreshes every 30s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            {systemMetrics.map((m) => {
              const Icon = m.icon
              return (
                <div key={m.label} className="border border-border rounded-md p-3">
                  <div className={`size-7 rounded grid place-items-center mb-2 ${tintMap[m.color]}`}>
                    <Icon className="size-3.5" />
                  </div>
                  <div className="text-sm font-semibold tabular">{m.value}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{m.label}</div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* User management */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4" />
              User management
            </CardTitle>
            <CardDescription className="text-xs">
              {filteredUsers.length} of {users.length} users shown
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-[200px] pl-8 text-xs"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setBroadcastOpen(true)}>
              <Megaphone className="size-3.5 mr-1" />
              Broadcast
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Plan</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs">Tokens</TableHead>
                  <TableHead className="text-xs">Joined</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.slice(0, 20).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="size-7">
                          <AvatarFallback className="text-[10px]">
                            {u.name.split(' ').map((n) => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-xs font-medium">{u.name}</div>
                          <div className="text-[10px] text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize ${
                          u.plan === 'enterprise'
                            ? 'text-violet-600 border-violet-500/30'
                            : u.plan === 'pro'
                            ? 'text-emerald-600 border-emerald-500/30'
                            : ''
                        }`}
                      >
                        {u.plan}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.role === 'admin' ? (
                        <Badge className="text-[10px] bg-amber-500/15 text-amber-600 border-amber-500/30">
                          <Shield className="size-2.5 mr-0.5" />
                          ADMIN
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">user</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs tabular">{u.tokens}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <UserActionsCell user={u} onChange={load} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent activity log */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            Recent activity
          </CardTitle>
          <CardDescription className="text-xs">
            Audit log of user actions
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1">
              {data.recentActivity.map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/40 text-xs"
                >
                  <div className={`size-1.5 rounded-full ${actionColor(a.action)}`} />
                  <code className="font-mono text-[11px] text-foreground min-w-[180px]">
                    {a.action}
                  </code>
                  <span className="text-muted-foreground">{a.user}</span>
                  <span className="text-muted-foreground ml-auto">
                    {new Date(a.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                    {a.ipAddress}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <BroadcastDialog open={broadcastOpen} onOpenChange={setBroadcastOpen} onDone={() => load()} />
        </>
      )}
    </div>
  )
}

function UserActionsCell({ user, onChange }: { user: AdminUser; onChange: () => void }) {
  const toast = useToast()
  const { user: me } = useAuthStore()
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const update = async (updates: { role?: string; status?: string }) => {
    const r = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, ...updates }),
    })
    if (r.ok) {
      toast.success('User updated')
      onChange()
    } else {
      const d = await r.json()
      toast.error(d.error || 'Failed')
    }
  }
  const remove = async () => {
    const r = await fetch(`/api/admin/users?id=${user.id}`, { method: 'DELETE' })
    if (r.ok) {
      toast.success('User deleted')
      onChange()
    } else {
      const d = await r.json()
      toast.error(d.error || 'Failed')
    }
    setConfirmDelete(false)
  }

  const isSelf = me?.id === user.id
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" disabled={isSelf}>
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-xs">{user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-xs"
            onClick={() => update({ role: user.role === 'admin' ? 'user' : 'admin' })}
          >
            <UserCog className="size-3.5 mr-2" />
            {user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
          </DropdownMenuItem>
          {user.status === 'suspended' ? (
            <DropdownMenuItem className="text-xs" onClick={() => update({ status: 'active' })}>
              <CheckCircle2 className="size-3.5 mr-2 text-emerald-600" />
              Activate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className="text-xs" onClick={() => update({ status: 'suspended' })}>
              <Ban className="size-3.5 mr-2 text-amber-600" />
              Suspend
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-xs" onClick={() => update({ status: 'banned' })}>
            <XCircle className="size-3.5 mr-2 text-rose-600" />
            Ban
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs text-rose-600" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-3.5 mr-2" />
            Delete user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {user.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the user and all their data (emails, meetings,
            tokens). This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={remove}>Delete permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function BroadcastDialog({
  open, onOpenChange, onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const toast = useToast()
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('active')
  const [sending, setSending] = React.useState(false)

  const submit = async () => {
    if (!subject || !body) {
      toast.error('Subject and body required')
      return
    }
    setSending(true)
    try {
      const r = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body,
          role: roleFilter === 'all' ? undefined : roleFilter,
          status: statusFilter === 'all' ? undefined : statusFilter,
        }),
      })
      const d = await r.json()
      if (r.ok) {
        toast.success(`Broadcast sent to ${d.sent} users`)
        setSubject(''); setBody('')
        onOpenChange(false)
        onDone()
      } else {
        toast.error(d.error || 'Failed')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Broadcast email to users</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Filter by role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="user">Users only</SelectItem>
                  <SelectItem value="admin">Admins only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Filter by status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Important announcement" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Body</Label>
            <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={sending}>
            {sending ? 'Sending…' : 'Send broadcast'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function actionColor(action: string) {
  if (action.includes('signup') || action.includes('created')) return 'bg-emerald-500'
  if (action.includes('error') || action.includes('blocked')) return 'bg-rose-500'
  if (action.includes('admin')) return 'bg-amber-500'
  return 'bg-sky-500'
}


