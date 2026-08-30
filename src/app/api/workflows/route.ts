import { apiError, workflowJson, workflowRepository } from '@/lib/workflows/api'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, 'workflow', 'read')
  if (authorization.response) return authorization.response
  const workflows = await workflowRepository.listWorkflows(authorization.context.workspaceId)
  return Response.json(workflows.map(workflowJson))
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeRequest(request, 'workflow', 'create')
    if (authorization.response) return authorization.response
    const body = await request.json()
    return Response.json(workflowJson(await workflowRepository.createDraft({ name: body.name, description: body.description, definition: body.definition, projectId: body.projectId, workspaceId: authorization.context.workspaceId })), { status: 201 })
  } catch (error) { return apiError(error) }
}
