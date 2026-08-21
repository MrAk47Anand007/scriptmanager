import { prisma } from '@/lib/db'
import { apiError, workflowJson, workflowRepository } from '@/lib/workflows/api'
import { removeWorkflowCronTrigger } from '@/lib/schedulerService'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const item = await workflowRepository.getWorkflow((await params).id)
  return item ? Response.json(workflowJson(item)) : Response.json({ error: 'Workflow not found' }, { status: 404 })
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const id = (await params).id; const body = await request.json(); const updated = await workflowRepository.updateDraft(id, body.definition); if (body.projectId !== undefined) await workflowRepository.setProject(id, body.projectId); return Response.json(workflowJson({ ...updated, projectId: body.projectId ?? updated.projectId })) }
  catch (error) { return apiError(error) }
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id
    const triggers = await prisma.workflowTrigger.findMany({ where: { workflowId: id }, select: { id: true } })
    for (const trigger of triggers) removeWorkflowCronTrigger(trigger.id)
    await workflowRepository.deleteWorkflow(id)
    return Response.json({ ok: true })
  }
  catch (error) { return apiError(error) }
}
