import { apiError, workflowRepository } from '@/lib/workflows/api'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return Response.json(await workflowRepository.retryNode((await params).id, (await request.json()).nodeId)) } catch (error) { return apiError(error) }
}
