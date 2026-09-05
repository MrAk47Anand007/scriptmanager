import { prisma } from '@/lib/db'
import { apiError, workflowJson, workflowRepository } from '@/lib/workflows/api'
import { removeWorkflowCronTrigger } from '@/lib/schedulerService'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, 'workflow', 'read')
  if (authorization.response) return authorization.response
  const item = await workflowRepository.getWorkflow((await params).id, authorization.context.workspaceId)
  return item ? Response.json(workflowJson(item)) : Response.json({ error: 'Workflow not found' }, { status: 404 })
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authorization = await authorizeRequest(request, 'workflow', 'update')
    if (authorization.response) return authorization.response
    const id = (await params).id
    const body = await request.json()
    const updated = await workflowRepository.updateDraft(id, body.definition, authorization.context.workspaceId)
    if (body.projectId !== undefined) await workflowRepository.setProject(id, body.projectId, authorization.context.workspaceId)
    return Response.json(workflowJson({ ...updated, projectId: body.projectId ?? updated.projectId }))
  }
  catch (error) { return apiError(error) }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authorization = await authorizeRequest(request, 'workflow', 'delete')
    if (authorization.response) return authorization.response
    const id = (await params).id
    const workflow = await workflowRepository.getWorkflow(id, authorization.context.workspaceId)
    if (!workflow) return Response.json({ error: 'Workflow not found' }, { status: 404 })
    const triggers = await prisma.workflowTrigger.findMany({ where: { workflowId: id, workflow: { workspaceId: authorization.context.workspaceId } }, select: { id: true } })
    for (const trigger of triggers) removeWorkflowCronTrigger(trigger.id)
    await workflowRepository.deleteWorkflow(id, authorization.context.workspaceId)
    return Response.json({ ok: true })
  }
  catch (error) { return apiError(error) }
}
