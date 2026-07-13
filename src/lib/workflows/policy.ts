export type RetryPolicy = { maxAttempts: number; delayMs: number; backoff: 'fixed' | 'exponential' }
export type FailureAction = 'stop' | 'continue'
export type ExecutionPolicy = { timeoutMs: number; retry: RetryPolicy; failureAction: FailureAction }

export function normalizeExecutionPolicy(input: {
  timeoutMs?: number
  retry?: Partial<RetryPolicy>
  failureAction?: FailureAction
}): ExecutionPolicy {
  return {
    timeoutMs: Math.min(Math.max(input.timeoutMs ?? 300_000, 1), 86_400_000),
    retry: {
      maxAttempts: Math.min(Math.max(input.retry?.maxAttempts ?? 1, 1), 20),
      delayMs: Math.min(Math.max(input.retry?.delayMs ?? 0, 0), 3_600_000),
      backoff: input.retry?.backoff ?? 'fixed',
    },
    failureAction: input.failureAction ?? 'stop',
  }
}

export function calculateRetryDelay(policy: RetryPolicy, attempt: number): number {
  const multiplier = policy.backoff === 'exponential' ? 2 ** Math.max(attempt - 1, 0) : 1
  return Math.min(policy.delayMs * multiplier, 3_600_000)
}

export function nextFailureAction(policy: Pick<ExecutionPolicy, 'retry' | 'failureAction'>, attempt: number): 'retry' | FailureAction {
  return attempt < policy.retry.maxAttempts ? 'retry' : policy.failureAction
}
