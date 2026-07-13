import { apiError, workflowJson, workflowRepository } from '@/lib/workflows/api'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const item = await workflowRepository.getWorkflow((await params).id)
  return item ? Response.json(workflowJson(item)) : Response.json({ error: 'Workflow not found' }, { status: 404 })
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return Response.json(workflowJson(await workflowRepository.updateDraft((await params).id, (await request.json()).definition))) }
  catch (error) { return apiError(error) }
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await workflowRepository.deleteWorkflow((await params).id); return Response.json({ ok: true }) }
  catch (error) { return apiError(error) }
}
