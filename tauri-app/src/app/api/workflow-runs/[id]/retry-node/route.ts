import { apiError, workflowRepository } from '@/lib/workflows/api'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, 'workflow', 'run')
  if (authorization.response) return authorization.response
  try { return Response.json(await workflowRepository.retryNode((await params).id, (await request.json()).nodeId, authorization.context.workspaceId)) } catch (error) { return apiError(error) }
}
