import { describe, expect, it } from 'vitest'
import { approvalRisk, approvalTimeoutHours, redactPreview } from '@/lib/workflows/worker'

describe('workflow approval metadata', () => {
  it('normalizes risk with medium default', () => {
    expect(approvalRisk(undefined)).toBe('medium')
    expect(approvalRisk('low')).toBe('low')
    expect(approvalRisk('high')).toBe('high')
    expect(approvalRisk('critical')).toBe('medium')
  })

  it('bounds the approval timeout between 1 and 168 hours', () => {
    expect(approvalTimeoutHours(undefined)).toBe(24)
    expect(approvalTimeoutHours(4)).toBe(4)
    expect(approvalTimeoutHours(1000)).toBe(168)
    expect(approvalTimeoutHours(0)).toBe(24)
    expect(approvalTimeoutHours(2.5)).toBe(24)
    expect(approvalTimeoutHours('6')).toBe(24)
  })

  it('redacts secret references and truncates long strings in previews', () => {
    const preview = redactPreview({
      token: { secretRef: 'vault-1' },
      nested: { deep: { secretRef: 'vault-2' } },
      log: 'x'.repeat(600),
      count: 3,
      list: [{ secretRef: 'vault-3' }],
    })
    expect(preview).toEqual({
      token: { secretRef: '[redacted]' },
      nested: { deep: { secretRef: '[redacted]' } },
      log: `${'x'.repeat(497)}...`,
      count: 3,
      list: [{ secretRef: '[redacted]' }],
    })
  })

  it('caps deeply nested previews', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'bottom' } } } } } }
    expect(redactPreview(deep)).toEqual({ a: { b: { c: { d: { e: '[depth]' } } } } })
  })
})
