import { describe, expect, it } from 'vitest'
import { resolveLocalBuildStatus } from '@/lib/localRunLifecycle'

describe('local run lifecycle', () => {
  it('records cancellation before timeout and process failure', () => {
    expect(resolveLocalBuildStatus(143, false, true)).toBe('cancelled')
    expect(resolveLocalBuildStatus(143, true, true)).toBe('timeout')
    expect(resolveLocalBuildStatus(1, false, false)).toBe('failure')
    expect(resolveLocalBuildStatus(0, false, false)).toBe('success')
  })
})
