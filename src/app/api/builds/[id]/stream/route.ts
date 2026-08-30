import { getBuildEmitter } from '@/lib/scriptRunner'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

function encodeSseData(payload: string): Uint8Array {
  const encoder = new TextEncoder()
  const body = payload
    .split(/\r?\n/)
    .map((line) => `data: ${line}\n`)
    .join('') + '\n'
  return encoder.encode(body)
}

// GET /api/builds/[id]/stream — SSE stream for real-time build output (id = buildId)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'read')
  if (authorization.response) return authorization.response
  const { id: buildId } = await params
  const build = await prisma.build.findFirst({ where: { id: buildId, script: { workspaceId: authorization.context.workspaceId } }, select: { id: true } })
  if (!build) return new Response(JSON.stringify({ error: 'Build not found' }), { status: 404, headers: { 'content-type': 'application/json' } })

  const stream = new ReadableStream({
    start(controller) {
      let emitter = getBuildEmitter(buildId)
      let attachRetry: ReturnType<typeof setInterval> | null = null
      let finished = false
      const startedAt = Date.now()

      const onLine = (line: string) => {
        controller.enqueue(encodeSseData(line))
      }

      const onDone = () => {
        if (finished) return
        finished = true
        controller.enqueue(encodeSseData('[DONE]'))
        cleanup()
        controller.close()
      }

      const cleanup = () => {
        if (attachRetry) {
          clearInterval(attachRetry)
          attachRetry = null
        }
        emitter?.off('line', onLine)
        emitter?.off('done', onDone)
      }

      const attachEmitter = () => {
        if (finished || emitter) return
        const nextEmitter = getBuildEmitter(buildId)
        if (!nextEmitter) return

        emitter = nextEmitter
        emitter.on('line', onLine)
        emitter.once('done', onDone)
      }

      attachEmitter()

      if (!emitter) {
        attachRetry = setInterval(async () => {
          attachEmitter()

          if (emitter || finished) return

          if (Date.now() - startedAt > 10_000) {
            controller.enqueue(encodeSseData('[ERROR] Build stream timed out before execution started'))
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

      // Clean up if the client disconnects
      req.signal.addEventListener('abort', () => {
        cleanup()
        controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
