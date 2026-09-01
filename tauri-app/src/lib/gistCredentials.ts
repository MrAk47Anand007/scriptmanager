import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { createSecretVaultService } from './secrets/service'
import type { SecretAccessContext } from './secrets/types'

export const GITHUB_GIST_SECRET_BINDING = {
  resourceType: 'github-gist',
  field: 'token',
} as const

type SecretVaultService = ReturnType<typeof createSecretVaultService>
type CredentialActor = { workspaceId: string; actorId: string }

function accessContext(workspaceId: string, actorId: string, reason: string): SecretAccessContext {
  return {
    actorType: 'system',
    actorId,
    workspaceId,
    capability: 'secret:read',
    resource: `${GITHUB_GIST_SECRET_BINDING.resourceType}:${workspaceId}`,
    reason,
  }
}

export function createGithubGistCredentialService(database: PrismaClient, vault: SecretVaultService) {
  async function findBinding(workspaceId: string) {
    return database.secretBinding.findUnique({
      where: {
        resourceType_resourceId_field: {
          resourceType: GITHUB_GIST_SECRET_BINDING.resourceType,
          resourceId: workspaceId,
          field: GITHUB_GIST_SECRET_BINDING.field,
        },
      },
      include: { secret: true },
    })
  }

  async function readLegacyToken() {
    return database.setting.findUnique({ where: { key: 'github_token' } })
  }

  async function removeLegacyToken() {
    await database.setting.deleteMany({ where: { key: 'github_token' } })
  }

  async function saveToken(token: string, actor: CredentialActor) {
    const value = token.trim()
    if (!value) throw new Error('GitHub token is required')

    const existing = await findBinding(actor.workspaceId)
    if (existing?.secret.status === 'active') {
      await vault.rotateSecret(existing.secretId, value, {
        ...accessContext(actor.workspaceId, actor.actorId, 'Update GitHub Gist token'),
        actorType: 'user',
        capability: 'secret:write',
      })
    } else {
      const secret = await vault.createSecret({
        name: `github-gist:${actor.workspaceId}:${randomUUID()}`,
        plaintext: value,
        description: 'GitHub Gist integration token',
        scope: 'resource',
        workspaceId: actor.workspaceId,
        createdBy: actor.actorId,
      })
      await vault.bindSecret(secret.id, {
        ...GITHUB_GIST_SECRET_BINDING,
        resourceId: actor.workspaceId,
        workspaceId: actor.workspaceId,
        createdBy: actor.actorId,
      })
    }

    await removeLegacyToken()
    return { configured: true }
  }

  return {
    async getStatus(workspaceId: string) {
      const binding = await findBinding(workspaceId)
      if (binding?.secret.status === 'active') return { configured: true }
      const legacy = await readLegacyToken()
      return { configured: Boolean(legacy?.value) }
    },

    saveToken,

    async resolveToken(input: { workspaceId: string; actorId?: string }) {
      const binding = await findBinding(input.workspaceId)
      if (binding?.secret.status === 'active') {
        return vault.resolveSecret(binding.secretId, accessContext(input.workspaceId, input.actorId ?? 'gist-runtime', 'GitHub Gist API request'))
      }

      const legacy = await readLegacyToken()
      if (!legacy?.value) {
        throw new Error('No GitHub token configured. Please set your GitHub token in Settings.')
      }

      await saveToken(legacy.value, { workspaceId: input.workspaceId, actorId: input.actorId ?? 'gist-migration' })
      const migrated = await findBinding(input.workspaceId)
      if (!migrated) throw new Error('GitHub token migration failed')
      return vault.resolveSecret(migrated.secretId, accessContext(input.workspaceId, input.actorId ?? 'gist-runtime', 'Resolve migrated GitHub Gist token'))
    },

    async clearToken(actor: CredentialActor) {
      const binding = await findBinding(actor.workspaceId)
      if (binding?.secret.status === 'active') {
        await vault.disableSecret(binding.secretId, {
          ...accessContext(actor.workspaceId, actor.actorId, 'Remove GitHub Gist token'),
          actorType: 'user',
          capability: 'secret:write',
        })
      }
      await removeLegacyToken()
      return { configured: false }
    },
  }
}
