import { safeStorage } from 'electron'
import { createElectronSecretStore } from '../src/lib/secrets/electronStore'

export function createOsBackedSecretStore() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS-backed secret encryption is unavailable')
  return createElectronSecretStore({
    seal: (plaintext) => safeStorage.encryptString(plaintext).toString('base64'),
    open: (ciphertext) => safeStorage.decryptString(Buffer.from(ciphertext, 'base64')),
  })
}
