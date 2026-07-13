import { apiError, workflowRepository } from '@/lib/workflows/api'
import { processWorkflowQueueOnce } from '@/lib/workflows/runtimeAdapters'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const result = await workflowRepository.approveNode((await params).id, (await request.json()).nodeId, 'admin'); void processWorkflowQueueOnce().catch((error) => console.error('[WorkflowWorker] Queue execution failed:', error)); return Response.json(result) } catch (error) { return apiError(error) }
}
