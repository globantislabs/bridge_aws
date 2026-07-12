'use client'

import * as React from 'react'
import { create } from 'zustand'

export type Role = 'user' | 'admin'

export interface CurrentUser {
  id: string
  email: string
  name: string
  avatarUrl?: string
  role: Role
  locale: string
  status: string
  title?: string | null
  company?: string | null
  timezone?: string | null
  bio?: string | null
  planTier: string
  apiTokensUsed: number
  apiTokensQuota: number
  meetingMinutesUsed: number
  meetingMinutesQuota: number
}

interface NavState {
  activeView: string
  activeParam: string | null
  setView: (view: string, param?: string | null) => void
}

export const useNavStore = create<NavState>((set) => ({
  // 'home' is the Google Meet-style opening screen — same for all roles.
  activeView: 'home',
  activeParam: null,
  setView: (activeView, activeParam = null) =>
    set({ activeView, activeParam }),
}))

interface AuthState {
  user: CurrentUser | null
  loading: boolean
  setUser: (u: CurrentUser | null) => void
  logout: () => void
  refresh: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => {
    // When user logs in, always default to 'home' (Google Meet-style opening).
    // The home view is identical for consumers and admins — admins just see
    // an extra "Admin Panel" entry in the sidebar.
    if (user) {
      useNavStore.getState().setView('home')
    }
    set({ user, loading: false })
  },
  logout: () => {
    useNavStore.getState().setView('home')
    set({ user: null, loading: false })
  },
  refresh: async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      if (!res.ok) {
        set({ user: null, loading: false })
        return
      }
      const data = await res.json()
      const user = data.user ?? null
      set({ user, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },
}))
