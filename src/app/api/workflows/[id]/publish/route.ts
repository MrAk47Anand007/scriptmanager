import { apiError, workflowRepository } from '@/lib/workflows/api'
import { validateWorkflowGraph } from '@/lib/workflows/graph'
import { parseWorkflowDefinition } from '@/lib/workflows/schema'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authorization = await authorizeRequest(request, 'workflow', 'update')
    if (authorization.response) return authorization.response
    const id = (await params).id
    const stored = await workflowRepository.getWorkflow(id, authorization.context.workspaceId)
    if (!stored) return Response.json({ error: 'Workflow not found' }, { status: 404 })
    const issues = validateWorkflowGraph(parseWorkflowDefinition(JSON.parse(stored.draftDefinition)))
    if (issues.length) return Response.json({ error: 'Workflow is invalid', issues }, { status: 422 })
    return Response.json(await workflowRepository.publish(id, authorization.context.workspaceId), { status: 201 })
  } catch (error) { return apiError(error) }
}
