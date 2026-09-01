import { observabilityError, observabilityWorkflowRepository } from '@/lib/observability/api'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const authorization = await authorizeRequest(request, 'workflow', 'run')
  if (authorization.response) return authorization.response
  try {
    const { kind, id } = await params
    if (kind !== 'workflow') return Response.json({ error: 'Retry is not supported for this execution type' }, { status: 409 })
    const body = await request.json().catch(() => ({})) as { nodeId?: string }
    const run = await observabilityWorkflowRepository.getRun(id, authorization.context.workspaceId)
    const nodeId = body.nodeId ?? run.nodeRuns.find(node => ['failed', 'interrupted'].includes(node.status))?.nodeId
    if (!nodeId) return Response.json({ error: 'No failed node is eligible for retry' }, { status: 409 })
    return Response.json(await observabilityWorkflowRepository.retryNode(id, nodeId, authorization.context.workspaceId))
  } catch (error) { return observabilityError(error) }
}
