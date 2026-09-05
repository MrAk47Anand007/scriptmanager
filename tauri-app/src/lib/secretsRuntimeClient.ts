type SecretPayload = { name: string; plaintext: string; description?: string; scope?: string }
type SecretActionPayload = { plaintext?: string; reason?: string }

function requireRuntime() {
  const runtime = window.scriptManagerDesktop?.runtime
  if (!runtime?.listSecrets || !runtime?.createSecret || !runtime?.rotateSecret || !runtime?.disableSecret) {
    throw new Error('Desktop runtime unavailable')
  }
  return runtime
}

export async function listSecretsRuntime() {
  return requireRuntime().listSecrets()
}

export async function createSecretRuntime(payload: SecretPayload) {
  return requireRuntime().createSecret(payload)
}

export async function rotateSecretRuntime(id: string, payload: SecretActionPayload) {
  return requireRuntime().rotateSecret({ id, ...payload })
}

export async function disableSecretRuntime(id: string, payload: Omit<SecretActionPayload, 'plaintext'>) {
  return requireRuntime().disableSecret({ id, ...payload })
}

export async function revealSecretRuntime(id: string): Promise<{ plaintext: string }> {
  const runtime = requireRuntime()
  if (!runtime.revealSecret) {
    throw new Error('Desktop runtime unavailable')
  }
  return runtime.revealSecret({ id })
}
