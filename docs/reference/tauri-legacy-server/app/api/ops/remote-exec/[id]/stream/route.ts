import { getRemoteExecEmitter } from '@/lib/sshService'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

// GET /api/ops/remote-exec/[id]/stream — SSE stream for remote execution output
// Mirrors the pattern from /api/builds/[id]/stream/route.ts exactly
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const authorization = await authorizeRequest(req, 'ops', 'read')
    if (authorization.response) return authorization.response
    const { id: remoteExecId } = await params
    const execution = await prisma.remoteExecution.findFirst({ where: { id: remoteExecId, profile: { workspaceId: authorization.context.workspaceId } } })
    if (!execution) return new Response(JSON.stringify({ error: 'Remote execution not found' }), { status: 404, headers: { 'content-type': 'application/json' } })

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

            const onDone = (exitCode: number) => {
                controller.enqueue(encoder.encode(`data: ${exitCode === 0 ? '[DONE]' : '[ERROR]'}\n\n`))
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
