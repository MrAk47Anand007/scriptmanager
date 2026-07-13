import type { SecretReference } from './types'

const OBJECT_PREFIX = 'secret_'
const STRING_PREFIX = 'secretref:'

export function createSecretReference(secretId: string): SecretReference {
  if (!secretId) throw new Error('Secret id is required')
  return { secretRef: `${OBJECT_PREFIX}${secretId}` }
}

export function isSecretReference(value: unknown): value is SecretReference {
  return !!value && typeof value === 'object' && Object.keys(value).length === 1 && typeof (value as SecretReference).secretRef === 'string' && (value as SecretReference).secretRef.startsWith(OBJECT_PREFIX) && (value as SecretReference).secretRef.length > OBJECT_PREFIX.length
}

export function parseSecretReference(reference: SecretReference | string): string {
  if (typeof reference === 'string') {
    if (!reference.startsWith(STRING_PREFIX) || reference.length === STRING_PREFIX.length) throw new Error('Invalid secret reference')
    return reference.slice(STRING_PREFIX.length)
  }
  if (!isSecretReference(reference)) throw new Error('Invalid secret reference')
  return reference.secretRef.slice(OBJECT_PREFIX.length)
}

export function serializeSecretReference(secretId: string): string {
  if (!secretId) throw new Error('Secret id is required')
  return `${STRING_PREFIX}${secretId}`
}
