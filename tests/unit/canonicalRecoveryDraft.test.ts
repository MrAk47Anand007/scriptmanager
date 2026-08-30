import { describe, expect, it } from 'vitest'
import { normalizeCanonicalRecoveryDraftInput } from '@/lib/canonicalRecoveryDraft'

describe('canonical recovery draft input', () => {
  it('normalizes the stored path to the authorized canonical source', () => {
    expect(normalizeCanonicalRecoveryDraftInput({
      scriptId: 'script-1',
      sourcePath: '/scripts/one.py',
      sourceRevision: '1:1',
      content: 'draft',
    }, '/scripts/one.py')).toEqual({
      scriptId: 'script-1',
      sourcePath: '/scripts/one.py',
      sourceRevision: '1:1',
      content: 'draft',
    })
  })

  it('rejects a renderer path that does not match the authorized source', () => {
    expect(() => normalizeCanonicalRecoveryDraftInput({
      scriptId: 'script-1',
      sourcePath: '/scripts/other.py',
      sourceRevision: '1:1',
      content: 'draft',
    }, '/scripts/one.py')).toThrow('canonical source path')
  })
})
