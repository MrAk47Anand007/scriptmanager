import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSecretVaultService } from '@/lib/secrets/service'
import { createServerSecretStore } from '@/lib/secrets/serverStore'
import { serializeExecutionEvent, createExecutionEvent } from '@/lib/execution/events'

describe('secret persistence redaction', () => {
  beforeEach(async () => { await prisma.secretAccessEvent.deleteMany(); await prisma.secretBinding.deleteMany(); await prisma.secretVersion.deleteMany(); await prisma.secret.deleteMany() })

  it('keeps plaintext out of vault records and registered execution serialization', async () => {
    const plaintext = 'phase5-unique-leak-sentinel'
    const service = createSecretVaultService(prisma, createServerSecretStore('phase5-redaction-test-key'))
    const secret = await service.createSecret({ name: 'Leak sentinel', plaintext, workspaceId: 'default', createdBy: 'redaction-test' })
    await service.bindSecret(secret.id, { resourceType: 'script', resourceId: 'redaction', field: 'TOKEN', workspaceId: 'default', createdBy: 'redaction-test' })
    const records = {
      secret: await prisma.secret.findUnique({ where: { id: secret.id } }),
      versions: await prisma.secretVersion.findMany({ where: { secretId: secret.id } }),
      bindings: await prisma.secretBinding.findMany({ where: { secretId: secret.id } }),
      events: await prisma.secretAccessEvent.findMany({ where: { secretId: secret.id } }),
    }
    expect(JSON.stringify(records)).not.toContain(plaintext)

    const event = createExecutionEvent({ type: 'execution.failed', executionKind: 'workflow', correlationId: 'corr_secret_redaction', actor: { type: 'system', id: 'worker' }, target: { type: 'workflow', id: 'redaction' }, data: { output: plaintext, secretRef: `secret_${secret.id}` } })
    expect(serializeExecutionEvent(event, [plaintext])).not.toContain(plaintext)
  })
})
