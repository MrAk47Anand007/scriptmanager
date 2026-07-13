import { apiError, workflowJson, workflowRepository } from '@/lib/workflows/api'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const item = await workflowRepository.getWorkflow((await params).id)
  return item ? Response.json(workflowJson(item)) : Response.json({ error: 'Workflow not found' }, { status: 404 })
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const id = (await params).id; const body = await request.json(); const updated = await workflowRepository.updateDraft(id, body.definition); if (body.projectId !== undefined) await workflowRepository.setProject(id, body.projectId); return Response.json(workflowJson({ ...updated, projectId: body.projectId ?? updated.projectId })) }
  catch (error) { return apiError(error) }
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await workflowRepository.deleteWorkflow((await params).id); return Response.json({ ok: true }) }
  catch (error) { return apiError(error) }
}
