import crypto from 'crypto'
import { prisma } from './db'

export interface EncryptedPayload {
    iv: string
    tag: string
    encrypted: string
}

/**
 * Retrieves the AES-256-GCM encryption key from the Setting table.
 * Generates and persists a new 32-byte key if one does not exist.
 */
export async function getEncryptionKey(): Promise<Buffer> {
    const existing = await prisma.setting.findUnique({ where: { key: 'ops_encryption_key' } })
    if (existing?.value) {
        return Buffer.from(existing.value, 'hex')
    }

    const newKey = crypto.randomBytes(32)
    await prisma.setting.upsert({
        where: { key: 'ops_encryption_key' },
        create: { key: 'ops_encryption_key', value: newKey.toString('hex') },
        update: { value: newKey.toString('hex') },
    })
    return newKey
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * A fresh 12-byte IV is generated for each call.
 */
export function encryptSecret(plaintext: string, key: Buffer): EncryptedPayload {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return {
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        encrypted: encrypted.toString('hex'),
    }
}

/**
 * Decrypts an AES-256-GCM encrypted payload.
 */
export function decryptSecret(payload: EncryptedPayload, key: Buffer): string {
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(payload.iv, 'hex')
    )
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'))
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payload.encrypted, 'hex')),
        decipher.final(),
    ])
    return decrypted.toString('utf8')
}
