import { apiError, workflowRepository } from '@/lib/workflows/api'
import { createWorkflowTriggerService } from '@/lib/workflows/triggers'
import { processWorkflowQueueOnce } from '@/lib/workflows/runtimeAdapters'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return Response.json(await workflowRepository.listRuns((await params).id))
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id
    const workflow = await workflowRepository.getWorkflow(id)
    if (!workflow?.publishedVersion) return Response.json({ error: 'Publish the workflow before running it' }, { status: 409 })
    const version = workflow.versions.find((item) => item.version === workflow.publishedVersion)!
    const body = await request.json().catch(() => ({}))
    const run = await createWorkflowTriggerService(workflowRepository).manual({ workflowId: id, versionId: version.id, actorId: 'admin', payload: body.input ?? {} })
    void processWorkflowQueueOnce().catch((error) => console.error('[WorkflowWorker] Queue execution failed:', error))
    return Response.json(run, { status: 202 })
  } catch (error) { return apiError(error) }
}
