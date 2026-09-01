import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { SecretStore } from './store'
import type { SecretStoreContext } from './types'

const DEVELOPMENT_KEY = 'scriptmanager-secret-vault-development-key-v1'

function contextBytes(context: SecretStoreContext): Buffer {
  return Buffer.from(`${context.secretId}:${context.version}`, 'utf8')
}

export function createServerSecretStore(masterKey = process.env.SECRET_VAULT_MASTER_KEY ?? process.env.DESKTOP_AUTH_SECRET ?? process.env.AUTH_SECRET): SecretStore {
  if (!masterKey && process.env.NODE_ENV === 'production') {
    throw new Error('SECRET_VAULT_MASTER_KEY is required in production')
  }
  const key = createHash('sha256').update(masterKey || DEVELOPMENT_KEY).digest()
  return {
    kind: 'server',
    async seal(plaintext, context) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(contextBytes(context))
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
    },
    async open(payload, context) {
      const [format, iv, tag, encrypted] = payload.split('.')
      if (format !== 'v1' || !iv || !tag || encrypted === undefined) throw new Error('Invalid secret ciphertext')
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
      decipher.setAAD(contextBytes(context))
      decipher.setAuthTag(Buffer.from(tag, 'base64url'))
      return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
    },
  }
}
