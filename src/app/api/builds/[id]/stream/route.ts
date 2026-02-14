import { getBuildEmitter } from '@/lib/scriptRunner'

// GET /api/builds/[id]/stream — SSE stream for real-time build output (id = buildId)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: buildId } = await params

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const emitter = getBuildEmitter(buildId)

      if (!emitter) {
        // Build already finished or doesn't exist — send DONE immediately
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
        return
      }

      const onLine = (line: string) => {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`))
      }

      const onDone = () => {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        cleanup()
        controller.close()
      }

      const cleanup = () => {
        emitter.off('line', onLine)
        emitter.off('done', onDone)
      }

      emitter.on('line', onLine)
      emitter.once('done', onDone)

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
