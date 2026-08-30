const ACTIVE_EXECUTION_RUN_STATUSES = new Set([
  'queued',
  'pending',
  'running',
  'waiting',
  'waiting_approval',
])

export function isExecutionRunActive(status: string | null | undefined): boolean {
  return typeof status === 'string' && ACTIVE_EXECUTION_RUN_STATUSES.has(status)
}
