import crypto from 'node:crypto'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken, resolveRequestContext } from '@/lib/rbac/requestContext'

beforeAll(async () => { await ensureDefaultWorkspace(prisma) })
afterEach(async () => { await prisma.userSession.deleteMany({ where: { userId: 'local-admin' } }) })

describe('persisted request session context', () => {
  it('resolves active membership permissions and rejects revoked sessions', async () => {
    const sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({ data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) } })
    const request = new Request('http://localhost/api/scripts', { headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } })
    await expect(resolveRequestContext(request)).resolves.toMatchObject({ userId: 'local-admin', workspaceId: 'default', roleKey: 'owner', permissions: expect.arrayContaining(['*:*']) })
    await prisma.userSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
    await expect(resolveRequestContext(request)).resolves.toBeNull()
  })
})
