import crypto from 'crypto'

// Documented fallback: only used when neither DESKTOP_AUTH_SECRET nor AUTH_SECRET
// is present in the environment. Data encrypted with the fallback key is portable
// across installs but NOT protected against an attacker who has this source code,
// so configuring a real secret is strongly recommended.
const FALLBACK_SECRET = 'scriptmanager-storage-secretbox-fallback-v1'

let warnedFallback = false

function getKey(): Buffer {
  let secret = process.env.DESKTOP_AUTH_SECRET ?? process.env.AUTH_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Storage encryption requires AUTH_SECRET or DESKTOP_AUTH_SECRET in production')
    }
    if (!warnedFallback) {
      warnedFallback = true
      console.warn(
        '[secretBox] DESKTOP_AUTH_SECRET / AUTH_SECRET not set — falling back to a built-in key for storage provider secrets. Set one of these env vars for proper encryption at rest.'
      )
    }
    secret = FALLBACK_SECRET
  }
  return crypto.createHash('sha256').update(secret).digest()
}

// Format: base64(iv).base64(tag).base64(cipher)
export function encryptString(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

export function decryptString(payload: string): string {
  const parts = payload.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format')
  }
  const [ivB64, tagB64, cipherB64] = parts
  const key = getKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(cipherB64, 'base64')), decipher.final()]).toString('utf8')
}
