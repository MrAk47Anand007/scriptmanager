import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSecretVaultService } from '@/lib/secrets/service'
import { createServerSecretStore } from '@/lib/secrets/serverStore'
import { createGithubGistCredentialService } from '@/lib/gistCredentials'

const credentials = createGithubGistCredentialService(
  prisma,
  createSecretVaultService(prisma, createServerSecretStore('gist-credentials-test-key')),
)

describe('GitHub Gist credentials', () => {
  beforeEach(async () => {
    await prisma.secretAccessEvent.deleteMany()
    await prisma.secretBinding.deleteMany()
    await prisma.secretVersion.deleteMany()
    await prisma.secret.deleteMany()
    await prisma.setting.deleteMany({ where: { key: 'github_token' } })
  })

  it('stores tokens in the vault and exposes only configured status', async () => {
    await expect(credentials.getStatus('default')).resolves.toEqual({ configured: false })

    await expect(credentials.saveToken('github-secret-token', {
      workspaceId: 'default',
      actorId: 'gist-settings-user',
    })).resolves.toEqual({ configured: true })

    const setting = await prisma.setting.findUnique({ where: { key: 'github_token' } })
    const binding = await prisma.secretBinding.findUnique({
      where: { resourceType_resourceId_field: { resourceType: 'github-gist', resourceId: 'default', field: 'token' } },
      include: { secret: { include: { versions: true } } },
    })

    expect(setting).toBeNull()
    expect(binding?.secret.versions[0]?.ciphertext).not.toContain('github-secret-token')
    await expect(credentials.getStatus('default')).resolves.toEqual({ configured: true })
    await expect(credentials.resolveToken({ workspaceId: 'default' })).resolves.toBe('github-secret-token')
  })

  it('migrates a legacy settings token on first resolve without returning it from status', async () => {
    await prisma.setting.create({ data: { key: 'github_token', value: 'legacy-github-token' } })

    await expect(credentials.getStatus('default')).resolves.toEqual({ configured: true })
    await expect(credentials.resolveToken({ workspaceId: 'default' })).resolves.toBe('legacy-github-token')

    await expect(prisma.setting.findUnique({ where: { key: 'github_token' } })).resolves.toBeNull()
    await expect(credentials.getStatus('default')).resolves.toEqual({ configured: true })
  })

  it('clears the token by disabling its vault secret and removing legacy state', async () => {
    await credentials.saveToken('github-secret-token', { workspaceId: 'default', actorId: 'gist-settings-user' })

    await expect(credentials.clearToken({ workspaceId: 'default', actorId: 'gist-settings-user' })).resolves.toEqual({ configured: false })
    await expect(credentials.getStatus('default')).resolves.toEqual({ configured: false })
    await expect(credentials.resolveToken({ workspaceId: 'default' })).rejects.toThrow('No GitHub token configured')
  })
})
