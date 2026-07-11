import type { PrismaClient } from '@prisma/client'
import { createProviderClient, deserializeProviderConfig, serializeProviderConfig } from './index'
import type { ProviderType } from './types'

export const SECRET_MASK = '•••'

// Config keys whose values are masked when listing providers.
const SECRET_FIELDS = new Set(['secretAccessKey', 'password', 'accessToken', 'refreshToken', 'clientSecret'])

export type StorageProviderRecord = {
  id: string
  name: string
  type: ProviderType
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type SaveStorageProviderPayload = {
  id?: string
  name: string
  type: ProviderType
  config: Record<string, unknown>
}

function maskConfig(config: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    masked[key] = SECRET_FIELDS.has(key) && typeof value === 'string' && value.length > 0 ? SECRET_MASK : value
  }
  return masked
}

function toRecord(row: { id: string; name: string; type: string; configJson: string; createdAt: Date; updatedAt: Date }): StorageProviderRecord {
  let config: Record<string, unknown> = {}
  try {
    config = maskConfig(deserializeProviderConfig(row.configJson))
  } catch {
    // Config not decryptable (e.g. secret changed) — surface an empty config rather than failing the list.
    config = {}
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type as ProviderType,
    config,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function listStorageProviders(prisma: PrismaClient): Promise<StorageProviderRecord[]> {
  const rows = await prisma.storageProvider.findMany({ orderBy: { name: 'asc' } })
  return rows.map(toRecord)
}

export async function saveStorageProvider(
  prisma: PrismaClient,
  payload: SaveStorageProviderPayload
): Promise<StorageProviderRecord> {
  if (!payload.name) {
    throw new Error('Name is required')
  }
  if (!payload.type) {
    throw new Error('Type is required')
  }

  const incoming = { ...(payload.config ?? {}) }

  const existing = payload.id
    ? await prisma.storageProvider.findUnique({ where: { id: payload.id } })
    : null

  // Merge masked secret fields from the existing record so edits without
  // re-entering secrets don't overwrite them with bullet characters.
  if (existing) {
    let previous: Record<string, unknown> = {}
    try {
      previous = deserializeProviderConfig(existing.configJson)
    } catch {
      previous = {}
    }
    for (const [key, value] of Object.entries(incoming)) {
      if (SECRET_FIELDS.has(key) && value === SECRET_MASK && key in previous) {
        incoming[key] = previous[key]
      }
    }
  }

  const configJson = serializeProviderConfig(incoming)

  const row = existing
    ? await prisma.storageProvider.update({
        where: { id: existing.id },
        data: { name: payload.name, type: payload.type, configJson },
      })
    : await prisma.storageProvider.create({
        data: { name: payload.name, type: payload.type, configJson },
      })

  return toRecord(row)
}

export async function deleteStorageProvider(prisma: PrismaClient, id: string): Promise<{ id: string }> {
  await prisma.collection.updateMany({
    where: { storageProviderId: id },
    data: { storageProviderId: null, remotePrefix: null },
  })
  await prisma.storageProvider.delete({ where: { id } })
  return { id }
}

export async function getDecryptedStorageProvider(
  prisma: PrismaClient,
  id: string
): Promise<{ id: string; name: string; type: ProviderType; config: Record<string, unknown> } | null> {
  const row = await prisma.storageProvider.findUnique({ where: { id } })
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    type: row.type as ProviderType,
    config: deserializeProviderConfig(row.configJson),
  }
}

export async function testStorageProvider(
  prisma: PrismaClient,
  id: string
): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  const provider = await getDecryptedStorageProvider(prisma, id)
  if (!provider) {
    return { ok: false, error: 'Storage provider not found' }
  }
  try {
    const client = createProviderClient(provider.type, provider.config)
    return await client.test()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
