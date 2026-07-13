import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createServerSecretStore } from '@/lib/secrets/serverStore'
import { createSecretVaultService } from '@/lib/secrets/service'

const store = createServerSecretStore('phase5-service-test-master-key')
const service = createSecretVaultService(prisma, store)
const access = {
  actorType: 'user' as const,
  actorId: 'user_phase5',
  workspaceId: 'default',
  capability: 'secret:read',
  resource: 'script:script_phase5',
  reason: 'integration test',
}

describe('secret vault service', () => {
  beforeEach(async () => {
    await prisma.secretAccessEvent.deleteMany()
    await prisma.secretBinding.deleteMany()
    await prisma.secretVersion.deleteMany()
    await prisma.secret.deleteMany()
  })

  it('stores ciphertext, rotates immutable versions, binds resources, and reveals with audit', async () => {
    const created = await service.createSecret({ name: 'Deploy token', plaintext: 'phase5-plaintext', createdBy: access.actorId, workspaceId: 'default' })
    const persisted = await prisma.secretVersion.findFirstOrThrow({ where: { secretId: created.id } })
    expect(persisted.ciphertext).not.toContain('phase5-plaintext')
    expect(JSON.stringify(created)).not.toContain('phase5-plaintext')

    await service.bindSecret(created.id, { resourceType: 'script', resourceId: 'script_phase5', field: 'DEPLOY_TOKEN', createdBy: access.actorId, workspaceId: 'default' })
    await service.rotateSecret(created.id, 'rotated-plaintext', access)
    await expect(service.resolveSecret(created.id, access)).resolves.toBe('rotated-plaintext')
    await expect(service.revealSecretOnce(created.id, access)).resolves.toEqual({ plaintext: 'rotated-plaintext', version: 2 })

    const versions = await prisma.secretVersion.findMany({ where: { secretId: created.id } })
    const events = await prisma.secretAccessEvent.findMany({ where: { secretId: created.id } })
    expect(versions.map((version) => version.version)).toEqual([1, 2])
    expect(events.map((event) => event.operation)).toEqual(expect.arrayContaining(['rotate', 'resolve', 'reveal_once']))
  })

  it('denies mismatched resources and disabled secrets while auditing denials', async () => {
    const created = await service.createSecret({ name: 'Scoped token', plaintext: 'scoped-value', createdBy: access.actorId, workspaceId: 'default' })
    await service.bindSecret(created.id, { resourceType: 'script', resourceId: 'script_phase5', field: 'TOKEN', createdBy: access.actorId, workspaceId: 'default' })
    await expect(service.resolveSecret(created.id, { ...access, resource: 'script:other' })).rejects.toThrow('resource')
    await service.disableSecret(created.id, access)
    await expect(service.resolveSecret(created.id, access)).rejects.toThrow('disabled')
    expect(await prisma.secretAccessEvent.count({ where: { secretId: created.id, outcome: 'denied' } })).toBe(2)
  })
})
