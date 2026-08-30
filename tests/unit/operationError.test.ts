import { describe, expect, it } from 'vitest'
import { getOperationError } from '@/lib/operationError'

describe('getOperationError', () => {
  it('reads common error shapes and falls back when no message exists', () => {
    expect(getOperationError(new Error('native failure'), 'fallback')).toBe('native failure')
    expect(getOperationError('string failure', 'fallback')).toBe('string failure')
    expect(getOperationError({ message: 'serialized failure' }, 'fallback')).toBe('serialized failure')
    expect(getOperationError({ error: 'ignored' }, 'fallback')).toBe('fallback')
  })
})
