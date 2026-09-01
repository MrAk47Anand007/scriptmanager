import type { SecretStore } from './store'

type OsSecretAdapter = { seal(plaintext: string): string | Promise<string>; open(ciphertext: string): string | Promise<string> }

export function createElectronSecretStore(adapter: OsSecretAdapter): SecretStore {
  return {
    kind: 'electron',
    async seal(plaintext) { return adapter.seal(plaintext) },
    async open(ciphertext) { return adapter.open(ciphertext) },
  }
}
