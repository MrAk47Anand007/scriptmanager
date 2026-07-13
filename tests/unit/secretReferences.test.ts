import { describe, expect, it } from 'vitest'
import { createSecretReference, isSecretReference, parseSecretReference, serializeSecretReference } from '@/lib/secrets/references'

describe('secret references', () => {
  it('uses opaque references without serialized plaintext', () => {
    const reference = createSecretReference('abc-123')
    expect(reference).toEqual({ secretRef: 'secret_abc-123' })
    expect(isSecretReference(reference)).toBe(true)
    expect(parseSecretReference(reference)).toBe('abc-123')
    expect(serializeSecretReference('abc-123')).toBe('secretref:abc-123')
    expect(JSON.stringify(reference)).not.toContain('credential-value')
  })

  it('rejects malformed references', () => {
    expect(isSecretReference({ secretRef: 'abc-123' })).toBe(false)
    expect(() => parseSecretReference({ secretRef: 'secret_' })).toThrow('Invalid secret reference')
  })
})
