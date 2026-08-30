import { describe, expect, it } from 'vitest'
import { shouldPollDesktopBuildHistory } from '@/lib/buildHistoryPolling'

describe('desktop build history polling', () => {
  it('requires an active desktop script', () => {
    expect(shouldPollDesktopBuildHistory(true, 'script-1')).toBe(true)
    expect(shouldPollDesktopBuildHistory(true, null)).toBe(false)
    expect(shouldPollDesktopBuildHistory(false, 'script-1')).toBe(false)
  })
})
