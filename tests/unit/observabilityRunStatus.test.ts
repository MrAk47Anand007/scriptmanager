import { describe, expect, it } from 'vitest'
import { isExecutionRunActive } from '@/lib/observability/runStatus'

describe('observability run status', () => {
  it('recognizes runs that can still change', () => {
    expect(isExecutionRunActive('queued')).toBe(true)
    expect(isExecutionRunActive('running')).toBe(true)
    expect(isExecutionRunActive('waiting')).toBe(true)
  })

  it('does not poll terminal or unknown statuses', () => {
    expect(isExecutionRunActive('succeeded')).toBe(false)
    expect(isExecutionRunActive('failed')).toBe(false)
    expect(isExecutionRunActive('cancelled')).toBe(false)
    expect(isExecutionRunActive(undefined)).toBe(false)
  })
})
