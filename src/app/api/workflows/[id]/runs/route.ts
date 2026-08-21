import { apiError, resolveWorkflowActor, workflowRepository } from '@/lib/workflows/api'
import { createWorkflowTriggerService } from '@/lib/workflows/triggers'
import { notifyWorkflowWorker } from '@/lib/workflows/workerLoop'

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
    const actor = await resolveWorkflowActor(request)
    const run = await createWorkflowTriggerService(workflowRepository).manual({ workflowId: id, versionId: version.id, actorId: actor.userId, payload: body.input ?? {} })
    notifyWorkflowWorker()
    return Response.json(run, { status: 202 })
  } catch (error) { return apiError(error) }
}
