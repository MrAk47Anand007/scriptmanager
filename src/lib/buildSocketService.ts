import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { isAuthenticatedCookieHeader } from '@/lib/session'
import { getBuildEmitter } from '@/lib/scriptRunner'
import { prisma } from '@/lib/db'

type BuildSocketMessage =
  | { type: 'subscribe'; buildId: string }
  | { type: 'unsubscribe'; buildId: string }

type BuildSubscription = {
  buildId: string
  cleanup: () => void
}

export const initBuildWebSocketServer = (server: Server) => {
  const wss = new WebSocketServer({ server, path: '/api/build-stream' })
  const defaultShouldHandle = wss.shouldHandle.bind(wss)

  wss.shouldHandle = (req) => {
    const allowed = defaultShouldHandle(req) && isAuthenticatedCookieHeader(req.headers.cookie)
    if (!allowed) {
      console.warn('[BuildSocket] Rejected unauthenticated build-stream upgrade')
    }
    return allowed
  }

  console.log('[BuildSocket] WebSocket server initialized at /api/build-stream')

  wss.on('connection', (ws, req) => {
    if (!isAuthenticatedCookieHeader(req.headers.cookie)) {
      ws.close(1008, 'Unauthorized')
      return
    }

    const subscriptions = new Map<string, BuildSubscription>()

    const sendJson = (payload: Record<string, unknown>) => {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify(payload))
    }

    const subscribe = (buildId: string) => {
      if (!buildId || subscriptions.has(buildId)) return

      let emitter = getBuildEmitter(buildId)
      let finished = false
      let attachRetry: ReturnType<typeof setInterval> | null = null

      const onLine = (line: string) => {
        sendJson({ type: 'line', buildId, line })
      }

      const onDone = () => {
        if (finished) return
        finished = true
        sendJson({ type: 'done', buildId })
        cleanup()
      }

      const cleanup = () => {
        if (attachRetry) {
          clearInterval(attachRetry)
          attachRetry = null
        }
        emitter?.off('line', onLine)
        emitter?.off('done', onDone)
        subscriptions.delete(buildId)
      }

      const attachEmitter = () => {
        if (finished || emitter) return
        const nextEmitter = getBuildEmitter(buildId)
        if (!nextEmitter) return

        emitter = nextEmitter
        emitter.on('line', onLine)
        emitter.once('done', onDone)
      }

      if (emitter) {
        emitter.on('line', onLine)
        emitter.once('done', onDone)
      } else {
        const startedAt = Date.now()
        attachRetry = setInterval(async () => {
          attachEmitter()
          if (emitter || finished) return

          if (Date.now() - startedAt > 10_000) {
            sendJson({ type: 'error', buildId, message: 'Build stream timed out before execution started' })
            onDone()
            return
          }

          const latestBuild = await prisma.build.findUnique({
            where: { id: buildId },
            select: { status: true },
          }).catch(() => null)

          if (latestBuild && !['pending', 'running'].includes(latestBuild.status)) {
            onDone()
          }
        }, 100)
      }

      subscriptions.set(buildId, { buildId, cleanup })
    }

    const unsubscribe = (buildId: string) => {
      subscriptions.get(buildId)?.cleanup()
    }

    ws.on('message', (raw) => {
      let payload: BuildSocketMessage | null = null
      try {
        payload = JSON.parse(raw.toString()) as BuildSocketMessage
      } catch {
        sendJson({ type: 'error', message: 'Invalid build socket message' })
        return
      }

      if (payload.type === 'subscribe') {
        subscribe(payload.buildId)
      }

      if (payload.type === 'unsubscribe') {
        unsubscribe(payload.buildId)
      }
    })

    ws.on('close', () => {
      for (const subscription of subscriptions.values()) {
        subscription.cleanup()
      }
      subscriptions.clear()
    })
  })
}
