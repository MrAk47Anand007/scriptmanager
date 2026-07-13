import type { ExecutionActor, ExecutionEventType } from './events'

export type ExecutionFinalStatus = 'running' | 'success' | 'failure' | 'timeout'

export interface ExecutionContext {
  correlationId: string
  actor: ExecutionActor
  trigger: 'manual' | 'webhook' | 'scheduler' | 'remote'
}

export function lifecycleEventType(status: ExecutionFinalStatus): ExecutionEventType {
  if (status === 'running') return 'execution.started'
  if (status === 'success') return 'execution.succeeded'
  if (status === 'timeout') return 'execution.timed_out'
  return 'execution.failed'
}
