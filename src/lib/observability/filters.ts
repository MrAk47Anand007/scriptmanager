import type { ExecutionFilters, ExecutionKind, ExecutionStatus } from './types'

const KINDS = new Set<ExecutionKind>(['workflow', 'script', 'api', 'remote'])
const STATUSES = new Set<ExecutionStatus>(['queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted'])

export function normalizeStatus(status: string): ExecutionStatus {
  if (['queued', 'pending'].includes(status)) return 'queued'
  if (['running', 'in_progress'].includes(status)) return 'running'
  if (['waiting_approval', 'pending_approval'].includes(status)) return 'waiting'
  if (['succeeded', 'completed', 'success', 'passed'].includes(status)) return 'succeeded'
  if (['cancelled', 'canceled'].includes(status)) return 'cancelled'
  if (['timed_out', 'timeout'].includes(status)) return 'timed_out'
  if (status === 'interrupted') return 'interrupted'
  return 'failed'
}

function date(value: string | null, name: string) {
  if (!value) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ${name}`)
  return parsed
}

export function parseExecutionFilters(params: URLSearchParams): ExecutionFilters {
  const kind = params.get('kind') as ExecutionKind | null
  const status = params.get('status') as ExecutionStatus | null
  if (kind && !KINDS.has(kind)) throw new Error('Invalid kind')
  if (status && !STATUSES.has(status)) throw new Error('Invalid status')
  const rawLimit = Number(params.get('limit') ?? 50)
  const limit = Math.min(200, Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 50))
  return {
    kind: kind ?? undefined, status: status ?? undefined,
    workflowId: params.get('workflow') ?? undefined, scriptId: params.get('script') ?? undefined,
    trigger: params.get('trigger') ?? undefined, actorId: params.get('user') ?? undefined,
    provider: params.get('provider') ?? undefined, projectId: params.get('project') ?? undefined,
    from: date(params.get('from'), 'from'), to: date(params.get('to'), 'to'), limit,
  }
}
