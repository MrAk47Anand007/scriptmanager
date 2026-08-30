'use client'

import { useEffect } from 'react'
import { listNotificationDeliveriesRuntime } from '@/lib/notificationsRuntimeClient'
import { advanceDesktopNotificationCursor, parseDesktopNotificationPayload } from '@/lib/desktopNotificationPoller'

const CURSOR_KEY = 'scriptManager_desktop_notification_cursor'
const POLL_INTERVAL_MS = 3_000

export function DesktopNotificationHost() {
  useEffect(() => {
    const desktop = window.__ELECTRON__ === true
    const showNotification = window.scriptManagerDesktop?.showNotification
    if (!desktop || !showNotification) return undefined

    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let cursor = localStorage.getItem(CURSOR_KEY) ?? new Date().toISOString()
    let polling = false

    const poll = async () => {
      if (stopped || polling) return
      polling = true
      try {
        const deliveries = await listNotificationDeliveriesRuntime(cursor)
        for (const delivery of deliveries) {
          if (stopped) return
          const nextCursor = advanceDesktopNotificationCursor(cursor, delivery)
          const payload = parseDesktopNotificationPayload(delivery)
          if (payload && localStorage.getItem('scriptManager_notifications') !== 'false') {
            await showNotification(payload)
          }
          cursor = nextCursor
          localStorage.setItem(CURSOR_KEY, cursor)
        }
      } catch {
        // Notification polling is best effort and must not affect the app shell.
      } finally {
        polling = false
        if (!stopped) timer = globalThis.setTimeout(() => void poll(), POLL_INTERVAL_MS)
      }
    }

    void poll()
    return () => {
      stopped = true
      if (timer) globalThis.clearTimeout(timer)
    }
  }, [])

  return null
}
