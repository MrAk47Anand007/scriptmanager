import { workflowRepository } from '@/lib/workflows/api'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { apiError } from '@/lib/workflows/api'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id
  const authorization = await authorizeRequest(request, 'workflow', 'read')
  if (authorization.response) return authorization.response
  let run
  try { run = await workflowRepository.getRun(id, authorization.context.workspaceId) } catch (error) { return apiError(error) }
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode(`event: run\ndata: ${JSON.stringify(run)}\n\n`))
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
}
