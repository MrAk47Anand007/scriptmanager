import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeCanonicalRecoveryDraftInput } from '@/lib/canonicalRecoveryDraft'

describe('canonical recovery draft input', () => {
  it('normalizes the stored path to the authorized canonical source', () => {
    const canonicalPath = path.resolve('/scripts/one.py')
    expect(normalizeCanonicalRecoveryDraftInput({
      scriptId: 'script-1',
      sourcePath: canonicalPath,
      sourceRevision: '1:1',
      content: 'draft',
    }, canonicalPath)).toEqual({
      scriptId: 'script-1',
      sourcePath: canonicalPath,
      sourceRevision: '1:1',
      content: 'draft',
    })
  })

  it('rejects a renderer path that does not match the authorized source', () => {
    const canonicalPath = path.resolve('/scripts/one.py')
    const otherPath = path.resolve('/scripts/other.py')
    expect(() => normalizeCanonicalRecoveryDraftInput({
      scriptId: 'script-1',
      sourcePath: otherPath,
      sourceRevision: '1:1',
      content: 'draft',
    }, canonicalPath)).toThrow('canonical source path')
  })
})
