import { apiError, workflowJson, workflowRepository } from '@/lib/workflows/api'

export async function GET(request: Request) {
  const workspaceId = (request as Request | undefined)?.headers.get('x-scriptmanager-workspace-id') ?? 'default'
  const workflows = await workflowRepository.listWorkflows(workspaceId)
  return Response.json(workflows.map(workflowJson))
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const workspaceId = request.headers.get('x-scriptmanager-workspace-id') ?? 'default'
    return Response.json(workflowJson(await workflowRepository.createDraft({ name: body.name, description: body.description, definition: body.definition, projectId: body.projectId, workspaceId })), { status: 201 })
  } catch (error) { return apiError(error) }
}
