import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  delete process.env.AUTH_SECRET
  delete process.env.DESKTOP_AUTH_SECRET
  delete process.env.NODE_ENV
})

describe('storage secret configuration', () => {
  it('rejects encryption with no configured secret in production', async () => {
    process.env.NODE_ENV = 'production'
    const { encryptString } = await import('@/lib/storage/secretBox')
    expect(() => encryptString('credential')).toThrow('Storage encryption requires AUTH_SECRET or DESKTOP_AUTH_SECRET in production')
  })
})
