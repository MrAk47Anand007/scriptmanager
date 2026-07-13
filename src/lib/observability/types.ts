export type ExecutionKind = 'workflow' | 'script' | 'api' | 'remote'
export type ExecutionStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out' | 'interrupted'

export interface ExecutionFilters {
  kind?: ExecutionKind
  status?: ExecutionStatus
  workflowId?: string
  scriptId?: string
  trigger?: string
  actorId?: string
  provider?: string
  projectId?: string
  from?: Date
  to?: Date
  limit: number
}

export interface ExecutionRunSummary {
  id: string
  kind: ExecutionKind
  name: string
  status: ExecutionStatus
  trigger: string
  actorId?: string
  correlationId?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  retryCount: number
}

export interface ExecutionDashboard {
  metrics: { active: number; succeeded: number; failed: number; timedOut: number; retried: number; averageDurationMs: number }
  activeRuns: ExecutionRunSummary[]
  recentRuns: ExecutionRunSummary[]
  failureTrend: Array<{ date: string; count: number }>
  scheduleHealth: { healthy: number; disabled: number; failing: number }
}

