import { describe, expect, it } from 'vitest'
import { calculateRetryDelay, nextFailureAction, normalizeExecutionPolicy } from '@/lib/workflows/policy'

describe('workflow execution policy', () => {
  it('provides bounded defaults', () => {
    expect(normalizeExecutionPolicy({})).toEqual({ timeoutMs: 300_000, retry: { maxAttempts: 1, delayMs: 0, backoff: 'fixed' }, failureAction: 'stop' })
  })

  it('calculates fixed and bounded exponential retry delays', () => {
    expect(calculateRetryDelay({ maxAttempts: 4, delayMs: 100, backoff: 'fixed' }, 3)).toBe(100)
    expect(calculateRetryDelay({ maxAttempts: 20, delayMs: 60_000, backoff: 'exponential' }, 20)).toBe(3_600_000)
  })

  it('retries until max attempts then applies failure action', () => {
    const policy = { retry: { maxAttempts: 2, delayMs: 0, backoff: 'fixed' as const }, failureAction: 'continue' as const }
    expect(nextFailureAction(policy, 1)).toBe('retry')
    expect(nextFailureAction(policy, 2)).toBe('continue')
  })
})
