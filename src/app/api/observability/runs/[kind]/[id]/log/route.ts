import { observabilityRepository } from '@/lib/observability/api'
import type { ExecutionKind } from '@/lib/observability/types'

export async function GET(_: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params
  if (!['workflow', 'script', 'api', 'remote'].includes(kind)) return new Response('Invalid kind', { status: 400 })
  const detail = await observabilityRepository.getRunDetail(kind as ExecutionKind, id)
  if (!detail) return new Response('Run not found', { status: 404 })
  return new Response(JSON.stringify(detail, null, 2), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${kind}-${id}-redacted.log"` } })
}
