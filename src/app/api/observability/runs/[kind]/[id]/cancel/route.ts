import { observabilityError, observabilityWorkflowRepository } from '@/lib/observability/api'

export async function POST(_: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { kind, id } = await params
    if (kind !== 'workflow') return Response.json({ error: 'Cancellation is not supported for this execution type' }, { status: 409 })
    return Response.json(await observabilityWorkflowRepository.requestCancellation(id))
  } catch (error) { return observabilityError(error) }
}

