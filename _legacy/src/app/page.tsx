'use client'

import * as React from 'react'
import { Sidebar } from '@/components/shell/sidebar'
import { Topbar } from '@/components/shell/topbar'
import { Landing } from '@/components/shell/landing'
import { HomeView } from '@/components/views/home-view'
import { MeetingsView } from '@/components/views/meetings-view'
import { AdminView } from '@/components/views/admin-view'
import { SettingsView } from '@/components/views/settings-view'
import { ToastViewport } from '@/lib/toast-store'
import { useAuthStore, useNavStore } from '@/lib/auth-store'
import { useToast } from '@/lib/toast-store'

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

export default function Home() {
  const { user, loading, refresh, logout: logoutStore } = useAuthStore()
  const { activeView, setView } = useNavStore()
  const toast = useToast()

  // When user clicks "New meeting" or "Start" in Home, switch to meetings view
  // with the meeting id as activeParam so MeetingsView opens the room directly.
  const [pendingMeeting, setPendingMeeting] = React.useState<MeetingItem | null>(null)

  React.useEffect(() => {
    refresh()
  }, [refresh])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    logoutStore()
    toast.info('Signed out')
  }

  function handleJoinMeeting(m: MeetingItem) {
    setPendingMeeting(m)
    setView('meetings')
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="text-center">
          <div
            className="font-medium text-3xl tracking-[-0.022em] text-foreground mx-auto mb-3"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Bridge
          </div>
          <div className="text-sm text-muted-foreground">Loading…</div>
        </div>
      </div>
    )
  }

  // Logged-out: marketing landing
  if (!user) {
    return (
      <>
        <Landing />
        <ToastViewport />
      </>
    )
  }

  // When in meetings view and we have a pending meeting, pass it to MeetingsView
  // so it opens the room directly.
  if (activeView === 'meetings' && pendingMeeting) {
    return (
      <>
        <div className="flex min-h-screen bg-background">
          <Sidebar onLogout={logout} onOpenAuth={() => {}} />
          <div className="flex-1 min-w-0 flex flex-col">
            <Topbar onNewMeeting={() => setView('home')} />
            <main className="flex-1 min-w-0">
              <MeetingsView
                initialMeeting={pendingMeeting}
                onLeave={() => {
                  setPendingMeeting(null)
                  setView('home')
                }}
              />
            </main>
          </div>
        </div>
        <ToastViewport />
      </>
    )
  }

  return (
    <>
      <div className="flex min-h-screen bg-background">
        <Sidebar onLogout={logout} onOpenAuth={() => {}} />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar onNewMeeting={() => setView('home')} />
          <main className="flex-1 min-w-0">
            {activeView === 'home' && (
              <HomeView onJoinMeeting={handleJoinMeeting} />
            )}
            {activeView === 'meetings' && (
              <MeetingsView
                onLeave={() => setView('home')}
              />
            )}
            {activeView === 'admin' && <AdminView />}
            {activeView === 'settings' && <SettingsView />}
          </main>
        </div>
      </div>
      <ToastViewport />
    </>
  )
}
