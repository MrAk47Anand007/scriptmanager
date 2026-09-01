type SecretPayload = { name: string; plaintext: string; description?: string; scope?: string }
type SecretActionPayload = { plaintext?: string; resource?: string; reason?: string }

export async function listSecretsRuntime() {
  if (window.scriptManagerDesktop?.runtime?.listSecrets) {
    return window.scriptManagerDesktop.runtime.listSecrets()
  }

  const response = await fetch('/api/secrets')
  if (!response.ok) {
    throw new Error('Failed to list secrets')
  }
  return response.json()
}

export async function createSecretRuntime(payload: SecretPayload) {
  if (window.scriptManagerDesktop?.runtime?.createSecret) {
    return window.scriptManagerDesktop.runtime.createSecret(payload)
  }

  const response = await fetch('/api/secrets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Failed to create secret')
  }
  return response.json()
}

export async function rotateSecretRuntime(id: string, payload: SecretActionPayload) {
  if (window.scriptManagerDesktop?.runtime?.rotateSecret) {
    return window.scriptManagerDesktop.runtime.rotateSecret({ id, ...payload })
  }

  const response = await fetch(`/api/secrets/${id}/rotate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Failed to rotate secret')
  }
  return response.json()
}

export async function disableSecretRuntime(id: string, payload: Omit<SecretActionPayload, 'plaintext'>) {
  if (window.scriptManagerDesktop?.runtime?.disableSecret) {
    return window.scriptManagerDesktop.runtime.disableSecret({ id, ...payload })
  }

  const response = await fetch(`/api/secrets/${id}/disable`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Failed to disable secret')
  }
  return response.json()
}
