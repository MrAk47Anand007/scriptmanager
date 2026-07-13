import { apiError, workflowRepository } from '@/lib/workflows/api'
import { validateWorkflowGraph } from '@/lib/workflows/graph'
import { parseWorkflowDefinition } from '@/lib/workflows/schema'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id
    const stored = await workflowRepository.getWorkflow(id)
    if (!stored) return Response.json({ error: 'Workflow not found' }, { status: 404 })
    const issues = validateWorkflowGraph(parseWorkflowDefinition(JSON.parse(stored.draftDefinition)))
    if (issues.length) return Response.json({ error: 'Workflow is invalid', issues }, { status: 422 })
    return Response.json(await workflowRepository.publish(id), { status: 201 })
  } catch (error) { return apiError(error) }
}
