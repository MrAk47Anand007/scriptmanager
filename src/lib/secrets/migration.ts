import type { PrismaClient } from '@prisma/client'
import { createServerSecretStore } from './serverStore'
import { createSecretVaultService } from './service'
import { parseSecretReference, serializeSecretReference } from './references'

export type ResourceSecret = { resourceType: string; resourceId: string; field: string; name: string; workspaceId?: string }

export async function storeResourceSecret(database: PrismaClient, target: ResourceSecret, plaintext: string, actorId = 'current-user') {
  const workspaceId = target.workspaceId ?? 'default'
  const service = createSecretVaultService(database, createServerSecretStore())
  const existing = await database.secretBinding.findUnique({ where: { resourceType_resourceId_field: { resourceType: target.resourceType, resourceId: target.resourceId, field: target.field } } })
  let secretId: string
  if (existing) {
    secretId = existing.secretId
    await service.rotateSecret(secretId, plaintext, { actorType: 'user', actorId, workspaceId, capability: 'secret:write', resource: `${target.resourceType}:${target.resourceId}`, reason: `Update ${target.field}` })
  } else {
    const secret = await service.createSecret({ name: target.name, plaintext, description: `${target.resourceType} ${target.field}`, scope: 'resource', workspaceId, createdBy: actorId })
    secretId = secret.id
    await service.bindSecret(secretId, { resourceType: target.resourceType, resourceId: target.resourceId, field: target.field, workspaceId, createdBy: actorId })
  }
  return serializeSecretReference(secretId)
}

export async function resolveResourceSecret(database: PrismaClient, stored: string, target: Omit<ResourceSecret, 'name'>, actorId: string) {
  if (!stored.startsWith('secretref:')) return null
  return createSecretVaultService(database, createServerSecretStore()).resolveSecret(parseSecretReference(stored), { actorType: 'system', actorId, workspaceId: target.workspaceId ?? 'default', capability: 'secret:read', resource: `${target.resourceType}:${target.resourceId}`, reason: `Resolve ${target.field}` })
}
