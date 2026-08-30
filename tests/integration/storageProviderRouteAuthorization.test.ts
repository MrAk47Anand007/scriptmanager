import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as listProviders, POST as createProvider } from '@/app/api/storage-providers/route'
import { DELETE as deleteProvider } from '@/app/api/storage-providers/[id]/route'
import { POST as testProvider } from '@/app/api/storage-providers/[id]/test/route'

let sessionId = ''
let sessionCookie = ''
let localProviderId = ''
let foreignProviderId = ''

describe('storage provider route authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.collection.updateMany({ data: { storageProviderId: null, remotePrefix: null } })
    await prisma.storageProvider.deleteMany()

    const local = await prisma.storageProvider.create({ data: { id: `local_provider_${crypto.randomUUID()}`, workspaceId: 'default', name: 'Local provider', type: 's3', configJson: '{}' } })
    const foreign = await prisma.storageProvider.create({ data: { id: `foreign_provider_${crypto.randomUUID()}`, workspaceId: 'foreign-workspace', name: 'Foreign provider', type: 's3', configJson: '{}' } })
    localProviderId = local.id
    foreignProviderId = foreign.id

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({ data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) } })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated provider access', async () => {
    expect((await listProviders(new Request('http://localhost/api/storage-providers'))).status).toBe(401)
  })

  it('lists only providers from the authenticated workspace', async () => {
    const response = await listProviders(new Request('http://localhost/api/storage-providers', { headers: { cookie: sessionCookie, 'x-scriptmanager-workspace-id': 'foreign-workspace' } }))
    expect(response.status).toBe(200)
    expect((await response.json() as Array<{ id: string }>).map((provider) => provider.id)).toEqual([localProviderId])
  })

  it('does not test or delete a provider from another workspace', async () => {
    const headers = { cookie: sessionCookie }
    const testResponse = await testProvider(new Request(`http://localhost/api/storage-providers/${foreignProviderId}/test`, { headers }), { params: Promise.resolve({ id: foreignProviderId }) })
    expect(testResponse.status).toBe(404)
    const deleteResponse = await deleteProvider(new Request(`http://localhost/api/storage-providers/${foreignProviderId}`, { headers }), { params: Promise.resolve({ id: foreignProviderId }) })
    expect(deleteResponse.status).toBe(404)
    expect(await prisma.storageProvider.findUnique({ where: { id: foreignProviderId } })).not.toBeNull()
  })

  it('creates a provider in the trusted workspace instead of a forged one', async () => {
    const response = await createProvider(new Request('http://localhost/api/storage-providers', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-scriptmanager-workspace-id': 'foreign-workspace' },
      body: JSON.stringify({ name: 'Trusted provider', type: 's3', config: {} }),
    }))
    expect(response.status).toBe(201)
    const created = await prisma.storageProvider.findFirstOrThrow({ where: { name: 'Trusted provider' } })
    expect(created.workspaceId).toBe('default')
  })
})
