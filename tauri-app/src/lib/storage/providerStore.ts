import type { PrismaClient } from '@prisma/client'
import { createProviderClient, deserializeProviderConfig, serializeProviderConfig } from './index'
import type { ProviderType } from './types'
import { randomUUID } from 'node:crypto'
import { resolveResourceSecret, storeResourceSecret } from '../secrets/migration'
import type { SecretVaultService } from '../secrets/service'

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
  workspaceId?: string
  actorId?: string
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

export async function listStorageProviders(prisma: PrismaClient, workspaceId = 'default'): Promise<StorageProviderRecord[]> {
  const rows = await prisma.storageProvider.findMany({ where: { workspaceId }, orderBy: { name: 'asc' } })
  return rows.map(toRecord)
}

export async function saveStorageProvider(
  prisma: PrismaClient,
  payload: SaveStorageProviderPayload,
  vault?: SecretVaultService,
  context: { workspaceId?: string; actorId?: string } = {},
): Promise<StorageProviderRecord> {
  if (!payload.name) {
    throw new Error('Name is required')
  }
  if (!payload.type) {
    throw new Error('Type is required')
  }

  const incoming = { ...(payload.config ?? {}) }

  const workspaceId = context.workspaceId ?? payload.workspaceId ?? 'default'
  const existing = payload.id
    ? await prisma.storageProvider.findFirst({ where: { id: payload.id, workspaceId } })
    : null
  if (payload.id && !existing) throw new Error('Storage provider not found')

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

  const providerId = existing?.id ?? randomUUID()
  for (const [key, value] of Object.entries(incoming)) {
    if (!SECRET_FIELDS.has(key) || typeof value !== 'string' || value.length === 0 || value === SECRET_MASK || value.startsWith('secretref:')) continue
    incoming[key] = await storeResourceSecret(prisma, { resourceType: 'storage-provider', resourceId: providerId, field: key, name: `storage:${providerId}:${key}`, workspaceId }, value, context.actorId ?? payload.actorId ?? 'current-user', vault)
  }

  const configJson = serializeProviderConfig(incoming)

  const row = existing
    ? await prisma.storageProvider.update({
        where: { id: existing.id },
        data: { name: payload.name, type: payload.type, configJson },
      })
    : await prisma.storageProvider.create({
        data: { id: providerId, workspaceId, name: payload.name, type: payload.type, configJson },
      })

  return toRecord(row)
}

export async function deleteStorageProvider(prisma: PrismaClient, id: string, workspaceId = 'default'): Promise<{ id: string }> {
  const existing = await prisma.storageProvider.findFirst({ where: { id, workspaceId }, select: { id: true } })
  if (!existing) throw new Error('Storage provider not found')
  await prisma.collection.updateMany({
    where: { storageProviderId: id, workspaceId },
    data: { storageProviderId: null, remotePrefix: null },
  })
  await prisma.storageProvider.delete({ where: { id } })
  return { id }
}

export async function getDecryptedStorageProvider(
  prisma: PrismaClient,
  id: string,
  vault?: SecretVaultService,
  workspaceId = 'default',
): Promise<{ id: string; name: string; type: ProviderType; config: Record<string, unknown> } | null> {
  const row = await prisma.storageProvider.findFirst({ where: { id, workspaceId } })
  if (!row) return null
  const config = deserializeProviderConfig(row.configJson)
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_FIELDS.has(key) && typeof value === 'string' && value.startsWith('secretref:')) {
      config[key] = await resolveResourceSecret(prisma, value, { resourceType: 'storage-provider', resourceId: row.id, field: key, workspaceId }, 'storage-runtime', vault)
    }
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type as ProviderType,
    config,
  }
}

export async function testStorageProvider(
  prisma: PrismaClient,
  id: string,
  vault?: SecretVaultService,
  workspaceId = 'default',
): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  const provider = await getDecryptedStorageProvider(prisma, id, vault, workspaceId)
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
