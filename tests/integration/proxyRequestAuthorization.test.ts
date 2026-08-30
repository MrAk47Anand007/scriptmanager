import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { POST as proxyRequest } from '@/app/api/proxy-request/route'

let sessionId = ''
let sessionCookie = ''

describe('proxy request authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    sessionId = crypto.randomUUID()
    const sessionToken = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({
      data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(sessionToken), expiresAt: new Date(Date.now() + 60_000) },
    })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}`
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated API execution', async () => {
    const response = await proxyRequest(new Request('http://localhost/api/proxy-request', { method: 'POST', body: '{}' }))
    expect(response.status).toBe(401)
  })

  it('requires API run permission before parsing or executing a request', async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId: 'default', key: 'viewer' } } })
    await prisma.membership.updateMany({ where: { userId: 'local-admin', workspaceId: 'default' }, data: { roleId: viewerRole.id } })

    const response = await proxyRequest(new Request('http://localhost/api/proxy-request', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.test' }),
    }))

    expect(response.status).toBe(403)
  })
})
