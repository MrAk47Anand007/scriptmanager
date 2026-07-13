import { afterEach, describe, expect, it } from 'vitest'
import { createServerSecretStore } from '@/lib/secrets/serverStore'
import { createElectronSecretStore } from '@/lib/secrets/electronStore'

const originalNodeEnv = process.env.NODE_ENV
const originalVaultKey = process.env.SECRET_VAULT_MASTER_KEY
const originalAuthSecret = process.env.AUTH_SECRET
const originalDesktopSecret = process.env.DESKTOP_AUTH_SECRET

afterEach(() => {
  Object.defineProperty(process.env, 'NODE_ENV', { value: originalNodeEnv, configurable: true, writable: true, enumerable: true })
  if (originalVaultKey === undefined) delete process.env.SECRET_VAULT_MASTER_KEY
  else process.env.SECRET_VAULT_MASTER_KEY = originalVaultKey
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET
  else process.env.AUTH_SECRET = originalAuthSecret
  if (originalDesktopSecret === undefined) delete process.env.DESKTOP_AUTH_SECRET
  else process.env.DESKTOP_AUTH_SECRET = originalDesktopSecret
})

describe('server secret store', () => {
  it('round trips authenticated ciphertext without deterministic output', async () => {
    const store = createServerSecretStore('phase5-test-master-key-that-is-long-enough')
    const context = { secretId: 'secret_1', version: 1 }
    const first = await store.seal('vault-plaintext', context)
    const second = await store.seal('vault-plaintext', context)

    expect(first).not.toBe(second)
    expect(first).not.toContain('vault-plaintext')
    await expect(store.open(first, context)).resolves.toBe('vault-plaintext')
    await expect(store.open(`${first.slice(0, -1)}A`, context)).rejects.toThrow()
  })

  it('requires an explicit master key in production', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true, writable: true, enumerable: true })
    delete process.env.SECRET_VAULT_MASTER_KEY
    delete process.env.AUTH_SECRET
    delete process.env.DESKTOP_AUTH_SECRET
    expect(() => createServerSecretStore()).toThrow('SECRET_VAULT_MASTER_KEY')
  })

  it('delegates desktop encryption to the OS-backed adapter', async () => {
    const store = createElectronSecretStore({ seal: (value) => `os:${value}`, open: (value) => value.slice(3) })
    await expect(store.seal('desktop-value', { secretId: 'x', version: 1 })).resolves.toBe('os:desktop-value')
    await expect(store.open('os:desktop-value', { secretId: 'x', version: 1 })).resolves.toBe('desktop-value')
  })
})
