import { apiError, workflowRepository } from '@/lib/workflows/api'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, 'workflow', 'read')
  if (authorization.response) return authorization.response
  try { return Response.json(await workflowRepository.getRun((await params).id, authorization.context.workspaceId)) } catch (error) { return apiError(error) }
}
