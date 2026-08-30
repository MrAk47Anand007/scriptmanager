import { describe, expect, it } from 'vitest'
import { isWorkflowRunActive } from '@/lib/workflows/runStatus'

describe('workflow run status', () => {
  it('polls queued, running, and waiting runs', () => {
    expect(isWorkflowRunActive('queued')).toBe(true)
    expect(isWorkflowRunActive('running')).toBe(true)
    expect(isWorkflowRunActive('waiting_approval')).toBe(true)
  })

  it('stops polling terminal runs', () => {
    expect(isWorkflowRunActive('succeeded')).toBe(false)
    expect(isWorkflowRunActive('failed')).toBe(false)
    expect(isWorkflowRunActive('cancelled')).toBe(false)
  })
})
