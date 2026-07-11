import { describe, expect, it } from 'vitest'
import { lifecycleEventType } from '@/lib/execution/lifecycle'

describe('execution lifecycle mapping', () => {
  it.each([
    ['running', 'execution.started'],
    ['success', 'execution.succeeded'],
    ['failure', 'execution.failed'],
    ['timeout', 'execution.timed_out'],
  ] as const)('maps %s to %s', (status, eventType) => {
    expect(lifecycleEventType(status)).toBe(eventType)
  })
})
