import { prisma } from '@/lib/db'
import { processPendingNotificationDeliveries } from './dispatcher'

const DEFAULT_POLL_INTERVAL_MS = 5_000

export type NotificationWorkerLoop = {
  drain: () => Promise<number>
  start: () => void
  stop: () => void
  isRunning: () => boolean
}

export function createNotificationWorkerLoop(options: { pollIntervalMs?: number; logger?: Pick<Console, 'log' | 'error'> } = {}): NotificationWorkerLoop {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const logger = options.logger ?? console
  let timer: ReturnType<typeof setInterval> | null = null
  let draining = false

  const drain = async () => {
    if (draining) return 0
    draining = true
    try {
      const result = await processPendingNotificationDeliveries(prisma)
      if (result.processed > 0) logger.log(`[NotificationWorker] Processed ${result.processed} delivery attempt(s)`)
      return result.processed
    } catch (error) {
      logger.error('[NotificationWorker] Delivery pass failed:', error)
      return 0
    } finally {
      draining = false
    }
  }

  return {
    drain,
    start() {
      if (timer) return
      void drain()
      timer = setInterval(() => void drain(), pollIntervalMs)
      timer.unref?.()
      logger.log(`[NotificationWorker] Started (poll every ${pollIntervalMs}ms)`)
    },
    stop() {
      if (!timer) return
      clearInterval(timer)
      timer = null
    },
    isRunning: () => timer !== null,
  }
}

let singleton: NotificationWorkerLoop | null = null

export function startNotificationWorker(): void {
  singleton ??= createNotificationWorkerLoop()
  singleton.start()
}

export function stopNotificationWorker(): void {
  singleton?.stop()
}
