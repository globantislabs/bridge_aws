'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/lib/toast-store'
import { useAuthStore } from '@/lib/auth-store'
import { Loader2 } from 'lucide-react'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  )
}

export function AuthModal({
  open,
  onOpenChange,
  initialMode = 'login',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialMode?: 'login' | 'signup'
}) {
  const [tab, setTab] = React.useState<'login' | 'signup'>(initialMode)
  const [email, setEmail] = React.useState('demo@bridge.app')
  const [password, setPassword] = React.useState('demo1234')
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [googleLoading, setGoogleLoading] = React.useState(false)
  const toast = useToast()
  const refresh = useAuthStore((s) => s.refresh)

  // Sync tab when modal opens with a new mode
  React.useEffect(() => {
    if (open) setTab(initialMode)
  }, [open, initialMode])

  async function submit() {
    setBusy(true)
    try {
      const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/signup'
      const payload: any = { email, password }
      if (tab === 'signup') payload.name = name
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Authentication failed', data.error)
        return
      }
      toast.success(tab === 'login' ? 'Welcome back' : 'Account created')
      await refresh()
      onOpenChange(false)
    } catch (e: any) {
      toast.error('Network error', e.message)
    } finally {
      setBusy(false)
    }
  }

  function signInWithGoogle() {
    setGoogleLoading(true)
    // Full-page redirect to /api/auth/google which routes through
    // Supabase OAuth in production or our built-in picker in sandbox.
    window.location.href = '/api/auth/google?return_to=/'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-tight">
            Welcome to Bridge
          </DialogTitle>
          <DialogDescription>
            Sign in to join meetings with real-time AI translation.
          </DialogDescription>
        </DialogHeader>

        <Button
          variant="outline"
          className="w-full h-11"
          onClick={signInWithGoogle}
          disabled={googleLoading || busy}
        >
          {googleLoading ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <GoogleIcon className="size-5 mr-2.5" />
          )}
          <span className="font-medium">
            {googleLoading ? 'Connecting…' : 'Continue with Google'}
          </span>
        </Button>

        <div className="relative my-1">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-3 text-xs uppercase tracking-wider text-muted-foreground">
              or
            </span>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="space-y-3 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd">Password</Label>
              <Input
                id="pwd"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <Button className="w-full" onClick={submit} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </TabsContent>
          <TabsContent value="signup" className="space-y-3 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-s">Email</Label>
              <Input
                id="email-s"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd-s">Password</Label>
              <Input
                id="pwd-s"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="••••••••"
              />
            </div>
            <Button className="w-full" onClick={submit} disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </Button>
          </TabsContent>
        </Tabs>
        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          <span className="font-medium text-foreground/80">Sandbox demo accounts:</span>
          <br />
          <code className="text-foreground">demo@bridge.app / demo1234</code>
          {' · '}
          <code className="text-foreground">admin@bridge.app / admin1234</code>
          <div className="mt-1.5 text-[10px]">
            First admin signup is auto-promoted to super-admin in production.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
