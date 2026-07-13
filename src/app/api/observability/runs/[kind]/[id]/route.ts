import { observabilityError, observabilityRepository } from '@/lib/observability/api'
import type { ExecutionKind } from '@/lib/observability/types'

export async function GET(_: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { kind, id } = await params
    if (!['workflow', 'script', 'api', 'remote'].includes(kind)) return Response.json({ error: 'Invalid kind' }, { status: 400 })
    const detail = await observabilityRepository.getRunDetail(kind as ExecutionKind, id)
    if (!detail) return Response.json({ error: 'Run not found' }, { status: 404 })
    return Response.json(detail)
  } catch (error) { return observabilityError(error) }
}
