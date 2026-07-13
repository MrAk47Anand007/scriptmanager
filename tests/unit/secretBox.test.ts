import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('storage secret configuration', () => {
  it('rejects encryption with no configured secret in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_SECRET', '')
    vi.stubEnv('DESKTOP_AUTH_SECRET', '')
    const { encryptString } = await import('@/lib/storage/secretBox')
    expect(() => encryptString('credential')).toThrow('Storage encryption requires AUTH_SECRET or DESKTOP_AUTH_SECRET in production')
  })
})
