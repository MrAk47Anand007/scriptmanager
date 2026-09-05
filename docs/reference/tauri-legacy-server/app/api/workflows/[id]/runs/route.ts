import { apiError, workflowRepository } from '@/lib/workflows/api'
import { createWorkflowTriggerService } from '@/lib/workflows/triggers'
import { notifyWorkflowWorker } from '@/lib/workflows/workerLoop'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, 'workflow', 'read')
  if (authorization.response) return authorization.response
  const workflowId = (await params).id
  if (!await workflowRepository.getWorkflow(workflowId, authorization.context.workspaceId)) {
    return Response.json({ error: 'Workflow not found' }, { status: 404 })
  }
  return Response.json(await workflowRepository.listRuns(workflowId, authorization.context.workspaceId))
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authorization = await authorizeRequest(request, 'workflow', 'run')
    if (authorization.response) return authorization.response
    const id = (await params).id
    const workflow = await workflowRepository.getWorkflow(id, authorization.context.workspaceId)
    if (!workflow?.publishedVersion) return Response.json({ error: 'Publish the workflow before running it' }, { status: 409 })
    const version = workflow.versions.find((item) => item.version === workflow.publishedVersion)!
    const body = await request.json().catch(() => ({}))
    const run = await createWorkflowTriggerService(workflowRepository).manual({ workflowId: id, versionId: version.id, actorId: authorization.context.userId, payload: body.input ?? {}, workspaceId: authorization.context.workspaceId })
    notifyWorkflowWorker()
    return Response.json(run, { status: 202 })
  } catch (error) { return apiError(error) }
}
