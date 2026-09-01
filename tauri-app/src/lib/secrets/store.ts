import type { SecretStoreContext } from './types'

export interface SecretStore {
  readonly kind: 'server' | 'electron'
  seal(plaintext: string, context: SecretStoreContext): Promise<string>
  open(ciphertext: string, context: SecretStoreContext): Promise<string>
}
