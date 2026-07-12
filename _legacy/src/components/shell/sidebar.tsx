'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import {
  Home,
  Shield,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
} from 'lucide-react'
import { useNavStore, useAuthStore } from '@/lib/auth-store'
import { usePrefs } from '@/lib/prefs-store'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface NavItem {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** 'admin' = super-admin only. Omitted = everyone. */
  adminOnly?: boolean
}

/**
 * Simplified Google Meet-style navigation.
 *   - Home (everyone)
 *   - Admin Panel (super-admin only)
 *   - Settings (everyone)
 *
 * No Mail, no Dashboard, no Billing as top-level nav items. Mail has been
 * removed from the product entirely. Billing is reachable from Settings.
 */
const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'admin', label: 'Admin Panel', icon: Shield, adminOnly: true },
  { key: 'settings', label: 'Settings', icon: Settings },
]

function getInitials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function Sidebar({
  onLogout,
  onOpenAuth,
}: {
  onLogout: () => void
  onOpenAuth: () => void
}) {
  const { activeView, setView } = useNavStore()
  const { user } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar } = usePrefs()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const isAdmin = user?.role === 'admin'
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin)

  return (
    <aside
      className={`${
        sidebarCollapsed ? 'w-[64px]' : 'w-[220px]'
      } shrink-0 border-r border-border bg-sidebar flex flex-col h-screen sticky top-0 transition-[width]`}
    >
      {/* Brand */}
      <div className="h-14 flex items-center gap-2 px-4 border-b border-border">
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          {!sidebarCollapsed ? (
            <>
              <span
                className="font-medium text-[18px] tracking-[-0.022em] text-foreground leading-none"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Bridge
              </span>
              <span className="text-[10px] text-muted-foreground/70 font-medium tracking-wider uppercase">
                Meet
              </span>
            </>
          ) : (
            <span
              className="font-medium text-[16px] tracking-[-0.022em] leading-none mx-auto"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              B
            </span>
          )}
        </div>
        {!sidebarCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 ml-auto"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
          >
            <PanelLeftClose className="size-3.5" />
          </Button>
        )}
        {sidebarCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 absolute -right-3 top-4 bg-card border border-border shadow-sm hidden lg:inline-flex"
            onClick={toggleSidebar}
            aria-label="Expand sidebar"
          >
            <PanelLeft className="size-3" />
          </Button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin p-2.5">
        {!sidebarCollapsed && (
          <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
            {isAdmin ? 'Admin' : 'Workspace'}
          </div>
        )}
        <div className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon
            const active = activeView === item.key
            const content = (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`group w-full flex items-center gap-2.5 rounded-md px-2.5 h-9 text-[13px] transition-colors ${
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                } ${sidebarCollapsed ? 'justify-center' : ''}`}
              >
                <Icon className="size-4 shrink-0" />
                {!sidebarCollapsed && (
                  <span className="flex-1 text-left truncate">{item.label}</span>
                )}
              </button>
            )
            return sidebarCollapsed ? (
              <TooltipProvider key={item.key} delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>{content}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              content
            )
          })}
        </div>
      </nav>

      {/* User */}
      <div className="border-t border-border p-2">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`w-full flex items-center gap-2 rounded-md p-1.5 hover:bg-sidebar-accent/60 transition-colors ${
                  sidebarCollapsed ? 'justify-center' : ''
                }`}
              >
                <Avatar className="size-7">
                  <AvatarFallback className="bg-primary/15 text-primary text-[11px] font-medium">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                {!sidebarCollapsed && (
                  <>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-xs font-medium truncate">
                        {user.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {user.email}
                      </div>
                    </div>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56 mb-2">
              <DropdownMenuLabel>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  {isAdmin ? 'Super admin' : 'Member'}
                </div>
                <div className="text-sm font-medium truncate">{user.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setView('settings')}>
                <Settings className="size-3.5 mr-2" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  setTheme(theme === 'dark' ? 'light' : 'dark')
                }
              >
                {mounted && theme === 'dark' ? (
                  <Sun className="size-3.5 mr-2" />
                ) : (
                  <Moon className="size-3.5 mr-2" />
                )}
                Toggle theme
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem onClick={() => setView('admin')}>
                  <Shield className="size-3.5 mr-2" /> Admin Panel
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onLogout}
                className="text-red-600 dark:text-red-400"
              >
                <LogOut className="size-3.5 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onOpenAuth}
          >
            Sign in
          </Button>
        )}
      </div>
    </aside>
  )
}
