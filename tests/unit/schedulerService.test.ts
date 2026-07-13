import { describe, expect, it } from 'vitest'
import { getNextRunTime } from '@/lib/schedulerService'

describe('scheduler service', () => {
  it('returns a future ISO timestamp for a valid cron expression', () => {
    const next = getNextRunTime('*/5 * * * *')
    expect(next).not.toBeNull()
    expect(Date.parse(next!)).toBeGreaterThan(Date.now())
  })

  it('returns null for an invalid cron expression', () => {
    expect(getNextRunTime('not a cron')).toBeNull()
  })
})
