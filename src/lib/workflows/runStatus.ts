const ACTIVE_WORKFLOW_RUN_STATUSES = new Set([
  'queued',
  'pending',
  'running',
  'waiting',
  'waiting_approval',
])

export function isWorkflowRunActive(status: string | null | undefined): boolean {
  return typeof status === 'string' && ACTIVE_WORKFLOW_RUN_STATUSES.has(status)
}
