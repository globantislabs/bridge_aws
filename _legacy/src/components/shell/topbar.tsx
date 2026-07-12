'use client'

import * as React from 'react'
import { Bell, Plus, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavStore } from '@/lib/auth-store'
import { useToast } from '@/lib/toast-store'

/**
 * Minimal top bar — brand on the left, single primary action on the right.
 * The actual meeting controls live in the Home view itself, so the topbar
 * is intentionally bare: notifications + a single CTA button.
 */
export function Topbar({ onNewMeeting }: { onNewMeeting: () => void }) {
  const { activeView } = useNavStore()
  const toast = useToast()

  const title =
    activeView === 'admin'
      ? 'Admin Panel'
      : activeView === 'settings'
      ? 'Settings'
      : 'Bridge Meet'

  return (
    <header className="h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
      <div className="h-full flex items-center gap-3 px-4 md:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-none truncate">
            {title}
          </h1>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 relative"
          onClick={() => toast.info('No new notifications')}
        >
          <Bell className="size-4" />
          <span className="sr-only">Notifications</span>
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
        </Button>

        <Button size="sm" className="h-8" onClick={onNewMeeting}>
          {activeView === 'admin' ? (
            <>
              <Plus className="size-3.5 mr-1" /> New meeting
            </>
          ) : (
            <>
              <Video className="size-3.5 mr-1.5" /> New meeting
            </>
          )}
        </Button>
      </div>
    </header>
  )
}
