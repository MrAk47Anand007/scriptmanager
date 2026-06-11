'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  message: string
  variant: ToastVariant
  leaving: boolean
}

type ToastListener = (message: string, variant: ToastVariant) => void

let nextId = 1
const listeners = new Set<ToastListener>()

function emit(message: string, variant: ToastVariant) {
  // No-op during SSR / outside the browser — lib callers import this module
  // from code that also runs on the server.
  if (typeof window === 'undefined') return
  listeners.forEach((listener) => listener(message, variant))
}

/** Module-level toast API — safe to call from non-React code (runtime clients). */
export const toast = {
  success: (message: string) => emit(message, 'success'),
  error: (message: string) => emit(message, 'error'),
  info: (message: string) => emit(message, 'info'),
}

const AUTO_DISMISS_MS = 4000
const FADE_MS = 130
const MAX_VISIBLE = 4

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-success/40 text-success',
  error: 'border-destructive/40 text-destructive',
  info: 'border-accent-brand/40 text-accent-brand',
}

/** Fixed bottom-right toast host. Mount once (WorkbenchShell). */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const timers = timersRef.current

    const beginDismiss = (id: number) => {
      setToasts((current) => current.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
      const removeTimer = setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== id))
        timers.delete(id)
      }, FADE_MS)
      timers.set(id, removeTimer)
    }

    const listener: ToastListener = (message, variant) => {
      const id = nextId++
      // Enter at opacity 0; flip to visible on the next frame for the fade-in.
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, message, variant, leaving: true }])
      requestAnimationFrame(() => {
        setToasts((current) => current.map((t) => (t.id === id ? { ...t, leaving: false } : t)))
      })
      timers.set(id, setTimeout(() => beginDismiss(id), AUTO_DISMISS_MS))
    }

    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const dismiss = (id: number) => {
    const timer = timersRef.current.get(id)
    if (timer) clearTimeout(timer)
    setToasts((current) => current.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    timersRef.current.set(
      id,
      setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), FADE_MS)
    )
  }

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-8 right-3 z-[100] flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'wb-transition pointer-events-auto flex items-start gap-2 rounded-md border bg-background px-3 py-2 text-xs shadow-lg',
            VARIANT_STYLES[t.variant],
            t.leaving ? 'opacity-0' : 'opacity-100'
          )}
        >
          <span className="min-w-0 flex-1 break-words text-foreground">{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            className="wb-transition shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => dismiss(t.id)}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
