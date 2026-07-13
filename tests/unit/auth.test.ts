import { describe, expect, it } from 'vitest'
import { generateApiToken, hashApiToken, hashPassword, verifyApiToken, verifyPassword } from '@/lib/auth'

describe('authentication primitives', () => {
  it('verifies the correct password and rejects an incorrect password', async () => {
    const stored = await hashPassword('correct horse battery staple')
    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true)
    await expect(verifyPassword('wrong password', stored)).resolves.toBe(false)
  })

  it('stores API tokens as one-way hashes', () => {
    const token = generateApiToken()
    const stored = hashApiToken(token)
    expect(stored).not.toContain(token)
    expect(verifyApiToken(token, stored)).toBe(true)
    expect(verifyApiToken(`${token}x`, stored)).toBe(false)
  })
})
