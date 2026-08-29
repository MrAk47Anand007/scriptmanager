import { observabilityError, observabilityRepository } from '@/lib/observability/api'
import type { ExecutionKind } from '@/lib/observability/types'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const authorization = await authorizeRequest(request, 'audit', 'read')
  if (authorization.response) return authorization.response
  try {
    const { kind, id } = await params
    if (!['workflow', 'script', 'api', 'remote'].includes(kind)) return Response.json({ error: 'Invalid kind' }, { status: 400 })
    const detail = await observabilityRepository.getRunDetail(kind as ExecutionKind, id, authorization.context.workspaceId)
    if (!detail) return Response.json({ error: 'Run not found' }, { status: 404 })
    return Response.json(detail)
  } catch (error) { return observabilityError(error) }
}
