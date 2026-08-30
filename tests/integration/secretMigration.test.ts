import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { POST } from '@/app/api/scripts/[id]/env/route'
import { POST as createServerProfile } from '@/app/api/ops/server-profiles/route'
import { getDecryptedStorageProvider, saveStorageProvider } from '@/lib/storage/providerStore'
import { deserializeProviderConfig } from '@/lib/storage'
import { createSecretVaultService } from '@/lib/secrets/service'
import { POST as createApiRequest } from '@/app/api/api-requests/route'
import { POST as rotateScriptWebhook } from '@/app/api/scripts/[id]/webhook/secret/route'
import { POST as createWorkflowTrigger } from '@/app/api/workflows/[id]/triggers/route'
import { POST as createNotificationChannel } from '@/app/api/notifications/channels/route'

const context = { params: Promise.resolve({ id: 'script_phase5_migration' }) }

let sessionId = ''
let sessionCookie = ''

describe('secret integration migration', () => {
  beforeEach(async () => {
    await prisma.secretAccessEvent.deleteMany(); await prisma.secretBinding.deleteMany(); await prisma.secretVersion.deleteMany(); await prisma.secret.deleteMany()
    await prisma.remoteExecution.deleteMany(); await prisma.serverProfile.deleteMany()
    await prisma.collection.updateMany({ data: { storageProviderId: null } }); await prisma.storageProvider.deleteMany()
    await prisma.apiHistory.deleteMany(); await prisma.apiRequest.deleteMany()
    await prisma.workflowTrigger.deleteMany(); await prisma.workflow.deleteMany({ where: { id: 'workflow_phase5_webhook' } })
    await prisma.notificationDelivery.deleteMany(); await prisma.notificationRule.deleteMany(); await prisma.notificationChannel.deleteMany()
    await prisma.scriptEnvVar.deleteMany(); await prisma.script.deleteMany({ where: { id: 'script_phase5_migration' } })
    await prisma.script.create({ data: { id: 'script_phase5_migration', name: 'Vault script', filename: 'vault.py', language: 'python' } })

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({
      data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) },
    })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('stores secret script environment values as opaque vault references', async () => {
    const response = await POST(new Request('http://localhost/api/scripts/x/env', { method: 'POST', headers: { cookie: sessionCookie, 'content-type': 'application/json' }, body: JSON.stringify({ key: 'DEPLOY_TOKEN', value: 'migration-plaintext', is_secret: true }) }), context)
    expect(response.status).toBe(200)
    const env = await prisma.scriptEnvVar.findFirstOrThrow({ where: { scriptId: 'script_phase5_migration', key: 'DEPLOY_TOKEN' } })
    expect(env.value).toMatch(/^secretref:/)
    expect(env.value).not.toContain('migration-plaintext')
    expect(await prisma.secretBinding.count({ where: { resourceType: 'script', resourceId: 'script_phase5_migration', field: 'DEPLOY_TOKEN' } })).toBe(1)
  })

  it('stores Ops passwords as bound vault references', async () => {
    const response = await createServerProfile(new Request('http://localhost/api/ops/server-profiles', { method: 'POST', headers: { cookie: sessionCookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Vault server', host: '127.0.0.1', username: 'ops', auth_method: 'password', secret: 'ops-migration-plaintext' }) }))
    expect(response.status).toBe(201)
    const profile = await prisma.serverProfile.findFirstOrThrow({ where: { name: 'Vault server' } })
    expect(profile.encryptedSecret).toMatch(/^secretref:/)
    expect(profile.encryptedSecret).not.toContain('ops-migration-plaintext')
    expect(await prisma.secretBinding.count({ where: { resourceType: 'server-profile', resourceId: profile.id, field: 'password' } })).toBe(1)
  })

  it('stores storage credentials as references and resolves them only for provider runtime', async () => {
    const saved = await saveStorageProvider(prisma, { name: 'Vault S3', type: 's3', config: { bucket: 'scripts', region: 'us-east-1', accessKeyId: 'access-id', secretAccessKey: 'storage-migration-plaintext' } })
    const row = await prisma.storageProvider.findUniqueOrThrow({ where: { id: saved.id } })
    const persistedConfig = deserializeProviderConfig(row.configJson)
    expect(persistedConfig.secretAccessKey).toMatch(/^secretref:/)
    expect(JSON.stringify(persistedConfig)).not.toContain('storage-migration-plaintext')
    const runtime = await getDecryptedStorageProvider(prisma, saved.id)
    expect(runtime?.config.secretAccessKey).toBe('storage-migration-plaintext')
  })

  it('uses an injected vault for desktop provider credentials', async () => {
    const calls = { seal: 0, open: 0 }
    const vault = createSecretVaultService(prisma, {
      kind: 'server',
      async seal(plaintext) {
        calls.seal += 1
        return `test:${plaintext}`
      },
      async open(ciphertext) {
        calls.open += 1
        return ciphertext.replace(/^test:/, '')
      },
    })

    const saved = await saveStorageProvider(prisma, {
      name: 'Injected S3',
      type: 's3',
      config: { bucket: 'scripts', accessKeyId: 'access-id', secretAccessKey: 'desktop-vault-secret' },
    }, vault)
    expect(calls.seal).toBe(1)

    const runtime = await getDecryptedStorageProvider(prisma, saved.id, vault)
    expect(runtime?.config.secretAccessKey).toBe('desktop-vault-secret')
    expect(calls.open).toBe(1)
  })

  it('stores API authentication fields as vault references', async () => {
    const response = await createApiRequest(new Request('http://localhost/api/api-requests', { method: 'POST', headers: { cookie: sessionCookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Vault API', url: 'https://example.com', auth_type: 'bearer', auth_config: JSON.stringify({ token: 'api-migration-plaintext' }) }) }))
    expect(response.status).toBe(200)
    const request = await prisma.apiRequest.findFirstOrThrow({ where: { name: 'Vault API' } })
    const auth = JSON.parse(request.authConfig)
    expect(auth.token).toMatch(/^secretref:/)
    expect(request.authConfig).not.toContain('api-migration-plaintext')
  })

  it('stores script and workflow webhook secrets as vault references while revealing new values once', async () => {
    const scriptResponse = await rotateScriptWebhook(new Request('http://localhost/api/scripts/x/webhook/secret', { method: 'POST', headers: { cookie: sessionCookie } }), context)
    const scriptBody = await scriptResponse.json()
    expect(scriptBody.webhook_secret).toBeTruthy()
    const script = await prisma.script.findUniqueOrThrow({ where: { id: 'script_phase5_migration' } })
    expect(script.webhookSecret).toMatch(/^secretref:/)
    expect(script.webhookSecret).not.toContain(scriptBody.webhook_secret)

    await prisma.workflow.create({ data: { id: 'workflow_phase5_webhook', name: 'Vault workflow', draftDefinition: '{}' } })
    const triggerResponse = await createWorkflowTrigger(new Request('http://localhost/api/workflows/x/triggers', { method: 'POST', headers: { 'content-type': 'application/json', cookie: sessionCookie }, body: JSON.stringify({ type: 'webhook' }) }), { params: Promise.resolve({ id: 'workflow_phase5_webhook' }) })
    const triggerBody = await triggerResponse.json()
    const trigger = await prisma.workflowTrigger.findUniqueOrThrow({ where: { id: triggerBody.id } })
    expect(trigger.webhookSecretEncrypted).toMatch(/^secretref:/)
    expect(trigger.webhookSecretEncrypted).not.toContain(triggerBody.webhookSecret)
  })

  it('stores notification transport credentials as vault references', async () => {
    const response = await createNotificationChannel(new Request('http://localhost/api/notifications/channels', { method: 'POST', headers: { cookie: sessionCookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Vault Slack', kind: 'slack', config: { url: 'https://hooks.example.test/notification-secret' } }) }))
    expect(response.status).toBe(201)
    const channel = await prisma.notificationChannel.findFirstOrThrow({ where: { name: 'Vault Slack' } })
    expect(JSON.parse(channel.configJson).url).toMatch(/^secretref:/)
    expect(channel.configJson).not.toContain('notification-secret')
  })
})
