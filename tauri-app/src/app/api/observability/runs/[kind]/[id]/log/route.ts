import { observabilityRepository } from '@/lib/observability/api'
import type { ExecutionKind } from '@/lib/observability/types'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const authorization = await authorizeRequest(request, 'audit', 'read')
  if (authorization.response) return authorization.response
  const { kind, id } = await params
  if (!['workflow', 'script', 'api', 'remote'].includes(kind)) return new Response('Invalid kind', { status: 400 })
  const detail = await observabilityRepository.getRunDetail(kind as ExecutionKind, id, authorization.context.workspaceId)
  if (!detail) return new Response('Run not found', { status: 404 })
  return new Response(JSON.stringify(detail, null, 2), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${kind}-${id}-redacted.log"` } })
}
