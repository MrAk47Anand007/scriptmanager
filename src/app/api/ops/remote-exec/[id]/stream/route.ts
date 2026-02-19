import { getRemoteExecEmitter } from '@/lib/sshService'

// GET /api/ops/remote-exec/[id]/stream — SSE stream for remote execution output
// Mirrors the pattern from /api/builds/[id]/stream/route.ts exactly
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: remoteExecId } = await params

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        start(controller) {
            const emitter = getRemoteExecEmitter(remoteExecId)

            if (!emitter) {
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
