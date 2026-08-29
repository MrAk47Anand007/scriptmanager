import { observabilityError, observabilityWorkflowRepository } from '@/lib/observability/api'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const authorization = await authorizeRequest(request, 'workflow', 'run')
  if (authorization.response) return authorization.response
  try {
    const { kind, id } = await params
    if (kind !== 'workflow') return Response.json({ error: 'Cancellation is not supported for this execution type' }, { status: 409 })
    return Response.json(await observabilityWorkflowRepository.requestCancellation(id, authorization.context.workspaceId))
  } catch (error) { return observabilityError(error) }
}
