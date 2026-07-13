import { workflowRepository } from '@/lib/workflows/api'
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const run = await workflowRepository.getRun(id)
      controller.enqueue(encoder.encode(`event: run\ndata: ${JSON.stringify(run)}\n\n`))
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
}
