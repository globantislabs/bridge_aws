'use client'

import * as React from 'react'
import { create } from 'zustand'

export type Toast = {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'success' | 'error' | 'warning'
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
    }, 4000)
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

export function ToastViewport() {
  const { toasts, dismiss } = useToastStore()
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg border p-3 shadow-lg backdrop-blur-md text-sm animate-in slide-in-from-bottom-2 ${
            t.variant === 'success'
              ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900 dark:bg-emerald-950/80 dark:border-emerald-800 dark:text-emerald-100'
              : t.variant === 'error'
              ? 'bg-red-50/95 border-red-200 text-red-900 dark:bg-red-950/80 dark:border-red-800 dark:text-red-100'
              : t.variant === 'warning'
              ? 'bg-amber-50/95 border-amber-200 text-amber-900 dark:bg-amber-950/80 dark:border-amber-800 dark:text-amber-100'
              : 'bg-card/95 border-border'
          }`}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">
              {t.title && <div className="font-medium">{t.title}</div>}
              {t.description && (
                <div className="text-xs opacity-90 mt-0.5">{t.description}</div>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-xs opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function useToast() {
  const push = useToastStore((s) => s.push)
  return {
    success: (title: string, description?: string) =>
      push({ title, description, variant: 'success' }),
    error: (title: string, description?: string) =>
      push({ title, description, variant: 'error' }),
    warning: (title: string, description?: string) =>
      push({ title, description, variant: 'warning' }),
    info: (title: string, description?: string) =>
      push({ title, description, variant: 'default' }),
  }
}
