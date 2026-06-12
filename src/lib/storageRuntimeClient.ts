import type { SaveStorageProviderPayload, StorageProviderRecord } from './storage/providerStore'

export type { SaveStorageProviderPayload, StorageProviderRecord }

export type StorageProviderTestResult = { ok: boolean; error?: string; latencyMs?: number }

export function hasDesktopStorageRuntime(): boolean {
  return Boolean(window.scriptManagerDesktop?.runtime?.listStorageProviders)
}

export async function listStorageProviders(): Promise<StorageProviderRecord[]> {
  if (hasDesktopStorageRuntime()) {
    return window.scriptManagerDesktop!.runtime!.listStorageProviders!() as Promise<StorageProviderRecord[]>
  }

  const response = await fetch('/api/storage-providers')
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Failed to list storage providers' }))
    throw new Error(data.error ?? 'Failed to list storage providers')
  }
  return response.json() as Promise<StorageProviderRecord[]>
}

export async function saveStorageProvider(payload: SaveStorageProviderPayload): Promise<StorageProviderRecord> {
  if (hasDesktopStorageRuntime()) {
    return window.scriptManagerDesktop!.runtime!.saveStorageProvider!(payload) as Promise<StorageProviderRecord>
  }

  const response = await fetch('/api/storage-providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Failed to save storage provider' }))
    throw new Error(data.error ?? 'Failed to save storage provider')
  }
  return response.json() as Promise<StorageProviderRecord>
}

export async function deleteStorageProvider(id: string): Promise<{ id: string }> {
  if (hasDesktopStorageRuntime()) {
    return window.scriptManagerDesktop!.runtime!.deleteStorageProvider!(id) as Promise<{ id: string }>
  }

  const response = await fetch(`/api/storage-providers/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Failed to delete storage provider' }))
    throw new Error(data.error ?? 'Failed to delete storage provider')
  }
  return response.json() as Promise<{ id: string }>
}

export async function testStorageProvider(id: string): Promise<StorageProviderTestResult> {
  if (hasDesktopStorageRuntime()) {
    return window.scriptManagerDesktop!.runtime!.testStorageProvider!(id) as Promise<StorageProviderTestResult>
  }

  const response = await fetch(`/api/storage-providers/${id}/test`, { method: 'POST' })
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Failed to test storage provider' }))
    throw new Error(data.error ?? 'Failed to test storage provider')
  }
  return response.json() as Promise<StorageProviderTestResult>
}
