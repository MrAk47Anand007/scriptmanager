import { apiError } from '@/lib/workflows/api'
import { processWorkflowQueueOnce } from '@/lib/workflows/runtimeAdapters'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const runId=(await params).id;const nodeId=(await request.json()).nodeId;const pending=await prisma.approvalRequest.findFirstOrThrow({where:{runId,nodeId,status:'pending'}});const result=await createApprovalService(prisma).decide(pending.id,'allow_once','admin'); void processWorkflowQueueOnce().catch((error) => console.error('[WorkflowWorker] Queue execution failed:', error)); return Response.json(result) } catch (error) { return apiError(error) }
}
