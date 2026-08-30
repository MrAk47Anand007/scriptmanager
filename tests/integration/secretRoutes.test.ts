import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { GET, POST } from '@/app/api/secrets/route'
import { POST as rotate } from '@/app/api/secrets/[id]/rotate/route'
import { POST as reveal } from '@/app/api/secrets/[id]/reveal/route'
import { POST as disable } from '@/app/api/secrets/[id]/disable/route'
import { POST as bind } from '@/app/api/secrets/[id]/bindings/route'
import { GET as history } from '@/app/api/secrets/[id]/history/route'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { defaultSecretVaultService } from '@/lib/secrets/defaultService'

let sessionCookie = ''

const jsonRequest = (url: string, body: unknown) => new Request(url, {
  method: 'POST',
  headers: {
    cookie: sessionCookie,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
})
const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe('secret vault routes', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.secretAccessEvent.deleteMany()
    await prisma.secretBinding.deleteMany()
    await prisma.secretVersion.deleteMany()
    await prisma.secret.deleteMany()

    const sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({
      data: {
        id: sessionId,
        userId: 'local-admin',
        workspaceId: 'default',
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.deleteMany({ where: { userId: 'local-admin' } })
  })

  it('creates and lists metadata without leaking plaintext', async () => {
    const createResponse = await POST(jsonRequest('http://localhost/api/secrets', { name: 'API token', plaintext: 'route-plaintext' }))
    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(JSON.stringify(created)).not.toContain('route-plaintext')

    const listResponse = await GET(new Request('http://localhost/api/secrets', { headers: { cookie: sessionCookie } }))
    const list = await listResponse.json()
    expect(list).toHaveLength(1)
    expect(JSON.stringify(list)).not.toContain('route-plaintext')
  })

  it('rotates and explicitly reveals one value', async () => {
    const created = await (await POST(jsonRequest('http://localhost/api/secrets', { name: 'Deploy token', plaintext: 'first-value' }))).json()
    expect((await rotate(jsonRequest('http://localhost/api/secrets/x/rotate', { plaintext: 'second-value', resource: '*' }), context(created.id))).status).toBe(200)
    const revealResponse = await reveal(jsonRequest('http://localhost/api/secrets/x/reveal', { resource: '*', reason: 'user requested reveal' }), context(created.id))
    expect(await revealResponse.json()).toMatchObject({ plaintext: 'second-value', version: 2 })
  })

  it('rejects cross-workspace reveal attempts even when the body forges a different workspace id', async () => {
    const secret = await defaultSecretVaultService().createSecret({
      name: 'Cross workspace token',
      plaintext: 'do-not-leak',
      workspaceId: 'workspace-b',
      createdBy: 'seed-user',
    })

    const response = await reveal(
      jsonRequest('http://localhost/api/secrets/x/reveal', { workspaceId: 'workspace-b', resource: '*', reason: 'forged workspace' }),
      context(secret.id),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Secret workspace does not match',
    })
  })

  it('does not allow foreign secret mutation or history access', async () => {
    const secret = await defaultSecretVaultService().createSecret({
      name: 'Foreign secret',
      plaintext: 'do-not-touch',
      workspaceId: 'workspace-b',
      createdBy: 'seed-user',
    })

    const disableResponse = await disable(jsonRequest('http://localhost/api/secrets/x/disable', { resource: '*', reason: 'forged disable' }), context(secret.id))
    expect(disableResponse.status).toBe(403)
    expect((await prisma.secret.findUniqueOrThrow({ where: { id: secret.id } })).status).toBe('active')

    const bindResponse = await bind(jsonRequest('http://localhost/api/secrets/x/bindings', { resourceType: 'script', resourceId: 'local-script', field: 'token' }), context(secret.id))
    expect(bindResponse.status).toBe(403)
    expect(await prisma.secretBinding.findFirst({ where: { secretId: secret.id } })).toBeNull()

    const historyResponse = await history(new Request(`http://localhost/api/secrets/${secret.id}/history`, { headers: { cookie: sessionCookie } }), context(secret.id))
    expect(historyResponse.status).toBe(403)
  })

  it('requires secret permissions for vault operations', async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId: 'default', key: 'viewer' } } })
    await prisma.membership.updateMany({ where: { userId: 'local-admin', workspaceId: 'default' }, data: { roleId: viewerRole.id } })

    expect((await POST(jsonRequest('http://localhost/api/secrets', { name: 'Viewer secret', plaintext: 'not-allowed' }))).status).toBe(403)
  })
})
