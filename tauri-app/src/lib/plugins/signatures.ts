import { createHash, verify } from 'node:crypto'

export function canonicalPluginPayload(manifest: unknown, source: string) {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, stable(nested)])) : value
  return JSON.stringify(stable(manifest)) + '\n' + source
}

export function pluginSourceHash(manifest: unknown, source: string) {
  return createHash('sha256').update(canonicalPluginPayload(manifest, source)).digest('hex')
}

export function verifyPluginSignature(manifest: unknown, source: string, signature?: string, publicKey?: string) {
  if (!signature || !publicKey) return false
  try { return verify(null, Buffer.from(canonicalPluginPayload(manifest, source)), publicKey, Buffer.from(signature, 'base64')) } catch { return false }
}
