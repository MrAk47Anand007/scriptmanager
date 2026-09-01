import { observabilityError, observabilityRepository } from '@/lib/observability/api'
import { parseExecutionFilters } from '@/lib/observability/filters'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, 'audit', 'read')
  if (authorization.response) return authorization.response
  try { return Response.json(await observabilityRepository.listRuns({ ...parseExecutionFilters(new URL(request.url).searchParams), workspaceId: authorization.context.workspaceId })) }
  catch (error) { return observabilityError(error) }
}
