import { prisma } from '@/lib/db'
import { removeWorkflowCronTrigger } from '@/lib/schedulerService'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; triggerId: string }> }) {
  const authorization = await authorizeRequest(request, 'workflow', 'update')
  if (authorization.response) return authorization.response
  const { id, triggerId } = await params
  const result = await prisma.workflowTrigger.deleteMany({ where: { id: triggerId, workflowId: id, workflow: { workspaceId: authorization.context.workspaceId } } })
  if (result.count) removeWorkflowCronTrigger(triggerId)
  return result.count ? Response.json({ ok: true }) : Response.json({ error: 'Trigger not found' }, { status: 404 })
}
