import crypto from 'node:crypto'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, hashApiToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken, resolveTrustedRequestContext } from '@/lib/rbac/requestContext'

beforeAll(async () => { await ensureDefaultWorkspace(prisma) })
afterEach(async () => { await prisma.userSession.deleteMany({ where: { userId: 'local-admin' } }) })

describe('persisted request session context', () => {
  it('resolves the local owner context for the Electron desktop session', async () => {
    const previousSecret = process.env.DESKTOP_AUTH_SECRET
    process.env.DESKTOP_AUTH_SECRET = 'desktop-context-test'
    const request = new Request('http://localhost/api/workflows', {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent('desktop:desktop-context-test')}` },
    })

    try {
      await expect(resolveTrustedRequestContext(request)).resolves.toMatchObject({
        runtimeMode: 'desktop',
        authType: 'desktop',
        actorId: 'local-admin',
        workspaceId: 'default',
        roleKey: 'owner',
        permissions: expect.arrayContaining(['*:*']),
      })
    } finally {
      if (previousSecret === undefined) delete process.env.DESKTOP_AUTH_SECRET
      else process.env.DESKTOP_AUTH_SECRET = previousSecret
    }
  })

  it('resolves active membership permissions and rejects revoked sessions', async () => {
    const sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({ data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) } })
    const request = new Request('http://localhost/api/scripts', { headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } })
    await expect(resolveTrustedRequestContext(request)).resolves.toMatchObject({
      runtimeMode: 'web',
      authType: 'session',
      actorId: 'local-admin',
      workspaceId: 'default',
      roleKey: 'owner',
      permissions: expect.arrayContaining(['*:*']),
    })
    await prisma.userSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
    await expect(resolveTrustedRequestContext(request)).resolves.toBeNull()
  })

  it('resolves the bearer API token context for hosted API routes', async () => {
    await prisma.setting.upsert({
      where: { key: 'api_token_hash' },
      update: { value: hashApiToken('context-test-token') },
      create: { key: 'api_token_hash', value: hashApiToken('context-test-token') },
    })
    try {
      const request = new Request('http://localhost/api/ops/server-profiles', { headers: { authorization: 'Bearer context-test-token' } })
      await expect(resolveTrustedRequestContext(request)).resolves.toMatchObject({
        runtimeMode: 'web',
        authType: 'bearer',
        actorId: 'local-admin',
        workspaceId: 'default',
      })
    } finally {
      await prisma.setting.delete({ where: { key: 'api_token_hash' } }).catch(() => undefined)
    }
  })
})
