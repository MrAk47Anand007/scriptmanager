import { apiError } from '@/lib/workflows/api'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
import type { ApprovalDecisionKind } from '@/lib/approvals/types'
import { notifyWorkflowWorker } from '@/lib/workflows/workerLoop'
import { workflowRepository } from '@/lib/workflows/api'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

const DECISION_KINDS: ApprovalDecisionKind[] = ['allow_once', 'allow_run', 'allow_workspace', 'reject']

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authorization = await authorizeRequest(request, 'approval', 'approve')
    if (authorization.response) return authorization.response
    const runId=(await params).id
    const body=await request.json().catch(() => ({}))
    const nodeId = body.nodeId
    const decision: ApprovalDecisionKind = DECISION_KINDS.includes(body.decision) ? body.decision : 'allow_once'
    await workflowRepository.getRun(runId, authorization.context.workspaceId)
    const pending=await prisma.approvalRequest.findFirstOrThrow({where:{runId,nodeId,status:'pending',workspaceId: authorization.context.workspaceId}})
    const result=await createApprovalService(prisma).decide(pending.id,decision,authorization.context.userId,body.note ?? '')
    notifyWorkflowWorker()
    return Response.json(result)
  } catch (error) { return apiError(error) }
}
