import { prisma } from '@/lib/db'
import { removeWorkflowCronTrigger } from '@/lib/schedulerService'
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; triggerId: string }> }) {
  const { id, triggerId } = await params
  const result = await prisma.workflowTrigger.deleteMany({ where: { id: triggerId, workflowId: id } })
  if (result.count) removeWorkflowCronTrigger(triggerId)
  return result.count ? Response.json({ ok: true }) : Response.json({ error: 'Trigger not found' }, { status: 404 })
}
