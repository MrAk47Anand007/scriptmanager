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

  throw new Error('Desktop runtime unavailable')
}

export async function saveStorageProvider(payload: SaveStorageProviderPayload): Promise<StorageProviderRecord> {
  if (hasDesktopStorageRuntime()) {
    return window.scriptManagerDesktop!.runtime!.saveStorageProvider!(payload) as Promise<StorageProviderRecord>
  }

  throw new Error('Desktop runtime unavailable')
}

export async function deleteStorageProvider(id: string): Promise<{ id: string }> {
  if (hasDesktopStorageRuntime()) {
    return window.scriptManagerDesktop!.runtime!.deleteStorageProvider!(id) as Promise<{ id: string }>
  }

  throw new Error('Desktop runtime unavailable')
}

export type CollectionSyncResult = {
  ok: boolean
  pulled: number
  pushed: number
  conflicts: number
  skipped: string[]
  error?: string
}

export async function syncCollectionRemote(collectionId: string): Promise<CollectionSyncResult> {
  if (hasDesktopStorageRuntime()) {
    return window.scriptManagerDesktop!.runtime!.syncCollection!(collectionId) as Promise<CollectionSyncResult>
  }

  throw new Error('Desktop runtime unavailable')
}

export async function testStorageProvider(id: string): Promise<StorageProviderTestResult> {
  if (hasDesktopStorageRuntime()) {
    return window.scriptManagerDesktop!.runtime!.testStorageProvider!(id) as Promise<StorageProviderTestResult>
  }

  throw new Error('Desktop runtime unavailable')
}
