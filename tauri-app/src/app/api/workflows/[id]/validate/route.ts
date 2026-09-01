import { workflowRepository } from '@/lib/workflows/api'
import { validateWorkflowGraph } from '@/lib/workflows/graph'
import { parseWorkflowDefinition } from '@/lib/workflows/schema'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authorization = await authorizeRequest(request, 'workflow', 'read')
    if (authorization.response) return authorization.response
    const body = await request.json().catch(() => ({}))
    const stored = await workflowRepository.getWorkflow((await params).id, authorization.context.workspaceId)
    if (!stored) return Response.json({ error: 'Workflow not found' }, { status: 404 })
    const definition = parseWorkflowDefinition(body.definition ?? JSON.parse(stored.draftDefinition))
    const issues = validateWorkflowGraph(definition)
    return Response.json({ valid: issues.length === 0, issues })
  } catch (error) { return Response.json({ valid: false, issues: [{ code: 'schema', message: error instanceof Error ? error.message : 'Invalid workflow' }] }, { status: 400 }) }
}
