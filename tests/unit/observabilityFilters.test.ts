import { describe, expect, it } from 'vitest'
import { normalizeStatus, parseExecutionFilters } from '@/lib/observability/filters'

describe('observability filters', () => {
  it('parses supported filters and clamps limits', () => {
    const filters = parseExecutionFilters(new URLSearchParams('kind=workflow&status=failed&trigger=cron&limit=999&from=2026-07-01T00:00:00.000Z'))
    expect(filters).toMatchObject({ kind: 'workflow', status: 'failed', trigger: 'cron', limit: 200 })
    expect(filters.from?.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })

  it('rejects invalid enum and date values', () => {
    expect(() => parseExecutionFilters(new URLSearchParams('kind=unknown'))).toThrow('Invalid kind')
    expect(() => parseExecutionFilters(new URLSearchParams('from=yesterday'))).toThrow('Invalid from')
  })

  it('normalizes source-specific statuses', () => {
    expect(normalizeStatus('completed')).toBe('succeeded')
    expect(normalizeStatus('pending_approval')).toBe('waiting')
    expect(normalizeStatus('timed_out')).toBe('timed_out')
    expect(normalizeStatus('anything-else')).toBe('failed')
  })
})
