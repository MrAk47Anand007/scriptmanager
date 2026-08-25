import { apiError, resolveWorkflowActor } from '@/lib/workflows/api'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
import type { ApprovalDecisionKind } from '@/lib/approvals/types'
import { notifyWorkflowWorker } from '@/lib/workflows/workerLoop'

const DECISION_KINDS: ApprovalDecisionKind[] = ['allow_once', 'allow_run', 'allow_workspace', 'reject']

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const runId=(await params).id
    const body=await request.json().catch(() => ({}))
    const nodeId = body.nodeId
    const decision: ApprovalDecisionKind = DECISION_KINDS.includes(body.decision) ? body.decision : 'allow_once'
    const pending=await prisma.approvalRequest.findFirstOrThrow({where:{runId,nodeId,status:'pending'}})
    const actor = await resolveWorkflowActor(request)
    const result=await createApprovalService(prisma).decide(pending.id,decision,actor.userId,body.note ?? '')
    notifyWorkflowWorker()
    return Response.json(result)
  } catch (error) { return apiError(error) }
}
