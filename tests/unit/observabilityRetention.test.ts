import { describe, expect, it, vi } from 'vitest'
import { cleanupObservabilityData } from '@/lib/observability/retention'

describe('observability retention', () => {
  it('deletes only events older than the clamped cutoff', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 4 })
    const result = await cleanupObservabilityData({ executionEvent: { deleteMany } } as never, { eventDays: 0, now: new Date('2026-07-13T00:00:00.000Z') })
    expect(deleteMany).toHaveBeenCalledWith({ where: { occurredAt: { lt: new Date('2026-07-12T00:00:00.000Z') } } })
    expect(result).toMatchObject({ deletedEvents: 4, eventDays: 1 })
  })
})
