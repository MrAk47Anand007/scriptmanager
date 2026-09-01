import type { PrismaClient } from '@prisma/client'
import { canReadSecret, resourceMatchesBinding } from './policy'
import type { SecretStore } from './store'
import type { SecretAccessContext } from './types'

type CreateSecretInput = { name: string; plaintext: string; description?: string; scope?: string; workspaceId: string; createdBy: string }
type BindSecretInput = { resourceType: string; resourceId: string; field: string; workspaceId: string; createdBy: string }

export function createSecretVaultService(database: PrismaClient, store: SecretStore) {
  async function record(secretId: string, version: number | null, context: SecretAccessContext, operation: string, outcome: string) {
    await database.secretAccessEvent.create({ data: { secretId, version, actorType: context.actorType, actorId: context.actorId, workspaceId: context.workspaceId, capability: context.capability, resource: context.resource, operation, reason: context.reason, outcome } })
  }

  async function getReadable(secretId: string, context: SecretAccessContext, operation: string) {
    const secret = await database.secret.findUnique({ where: { id: secretId }, include: { bindings: true, versions: { orderBy: { version: 'desc' }, take: 1 } } })
    if (!secret) throw new Error('Secret not found')
    const version = secret.versions[0]?.version ?? null
    const deny = async (message: string) => { await record(secretId, version, context, operation, 'denied'); throw new Error(message) }
    if (secret.workspaceId !== context.workspaceId) return deny('Secret workspace does not match')
    if (secret.status !== 'active') return deny('Secret is disabled')
    if (!canReadSecret(context)) return deny('Secret capability denied')
    if (secret.bindings.length > 0 && !secret.bindings.some((binding) => resourceMatchesBinding(context.resource, binding))) return deny('Secret resource does not match its binding')
    const current = secret.versions[0]
    if (!current) return deny('Secret has no version')
    return { secret, current }
  }

  return {
    async createSecret(input: CreateSecretInput) {
      return database.$transaction(async (tx) => {
        const secret = await tx.secret.create({ data: { name: input.name, description: input.description ?? '', scope: input.scope ?? 'workspace', workspaceId: input.workspaceId, createdBy: input.createdBy } })
        const ciphertext = await store.seal(input.plaintext, { secretId: secret.id, version: 1 })
        await tx.secretVersion.create({ data: { secretId: secret.id, version: 1, ciphertext, storeKind: store.kind, createdBy: input.createdBy } })
        return secret
      })
    },
    async listSecrets(workspaceId: string) {
      return database.secret.findMany({ where: { workspaceId }, include: { _count: { select: { bindings: true, accessEvents: true } } }, orderBy: { name: 'asc' } })
    },
    async rotateSecret(secretId: string, plaintext: string, context: SecretAccessContext) {
      const secret = await database.secret.findUniqueOrThrow({ where: { id: secretId } })
      if (secret.workspaceId !== context.workspaceId || secret.status !== 'active') throw new Error('Secret cannot be rotated')
      const version = secret.currentVersion + 1
      const ciphertext = await store.seal(plaintext, { secretId, version })
      await database.$transaction([
        database.secretVersion.create({ data: { secretId, version, ciphertext, storeKind: store.kind, createdBy: context.actorId } }),
        database.secret.update({ where: { id: secretId }, data: { currentVersion: version } }),
        database.secretAccessEvent.create({ data: { secretId, version, actorType: context.actorType, actorId: context.actorId, workspaceId: context.workspaceId, capability: context.capability, resource: context.resource, operation: 'rotate', reason: context.reason, outcome: 'allowed' } }),
      ])
      return { id: secretId, version }
    },
    async disableSecret(secretId: string, context: SecretAccessContext) {
      const existing = await database.secret.findUnique({ where: { id: secretId } })
      if (!existing) throw new Error('Secret not found')
      if (existing.workspaceId !== context.workspaceId) throw new Error('Secret workspace does not match')
      const secret = await database.secret.update({ where: { id: secretId }, data: { status: 'disabled', disabledAt: new Date() } })
      await record(secretId, secret.currentVersion, context, 'disable', 'allowed')
      return secret
    },
    async bindSecret(secretId: string, input: BindSecretInput) {
      const secret = await database.secret.findUnique({ where: { id: secretId } })
      if (!secret) throw new Error('Secret not found')
      if (secret.workspaceId !== input.workspaceId) throw new Error('Secret workspace does not match')
      if (secret.status !== 'active') throw new Error('Secret is disabled')
      return database.secretBinding.upsert({ where: { resourceType_resourceId_field: { resourceType: input.resourceType, resourceId: input.resourceId, field: input.field } }, create: { secretId, ...input }, update: { secretId, workspaceId: input.workspaceId, createdBy: input.createdBy } })
    },
    async resolveSecret(secretId: string, context: SecretAccessContext) {
      const { current } = await getReadable(secretId, context, 'resolve')
      const plaintext = await store.open(current.ciphertext, { secretId, version: current.version })
      await record(secretId, current.version, context, 'resolve', 'allowed')
      return plaintext
    },
    async revealSecretOnce(secretId: string, context: SecretAccessContext) {
      const { current } = await getReadable(secretId, { ...context, capability: 'secret:reveal' }, 'reveal_once')
      const plaintext = await store.open(current.ciphertext, { secretId, version: current.version })
      await record(secretId, current.version, { ...context, capability: 'secret:reveal' }, 'reveal_once', 'allowed')
      return { plaintext, version: current.version }
    },
    async accessHistory(secretId: string, workspaceId?: string) {
      const secret = await database.secret.findUnique({ where: { id: secretId }, select: { workspaceId: true } })
      if (!secret) throw new Error('Secret not found')
      if (workspaceId && secret.workspaceId !== workspaceId) throw new Error('Secret workspace does not match')
      return database.secretAccessEvent.findMany({ where: { secretId }, orderBy: { createdAt: 'desc' } })
    },
  }
}

export type SecretVaultService = ReturnType<typeof createSecretVaultService>
