import { apiError, resolveWorkflowActor } from '@/lib/workflows/api'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
import { notifyWorkflowWorker } from '@/lib/workflows/workerLoop'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const runId=(await params).id
    const nodeId=(await request.json()).nodeId
    const pending=await prisma.approvalRequest.findFirstOrThrow({where:{runId,nodeId,status:'pending'}})
    const actor = await resolveWorkflowActor(request)
    const result=await createApprovalService(prisma).decide(pending.id,'allow_once',actor.userId)
    notifyWorkflowWorker()
    return Response.json(result)
  } catch (error) { return apiError(error) }
}
