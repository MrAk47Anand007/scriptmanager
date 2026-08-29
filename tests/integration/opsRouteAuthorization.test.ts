import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as listProfiles } from '@/app/api/ops/server-profiles/route'
import { GET as readProfile } from '@/app/api/ops/server-profiles/[id]/route'
import { GET as readAuditLog } from '@/app/api/ops/audit-log/route'

let profileId = ''
let sessionId = ''
let sessionCookie = ''

describe('hosted operations route authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    profileId = crypto.randomUUID()
    await prisma.serverProfile.create({ data: { id: profileId, workspaceId: 'foreign-workspace', name: 'Foreign server', host: 'foreign.example', username: 'other-user' } })

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({
      data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) },
    })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.serverProfile.delete({ where: { id: profileId } }).catch(() => undefined)
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated operations reads', async () => {
    await expect(listProfiles(new Request('http://localhost/api/ops/server-profiles'))).resolves.toMatchObject({ status: 401 })
    await expect(readAuditLog(new Request('http://localhost/api/ops/audit-log'))).resolves.toMatchObject({ status: 401 })
  })

  it('does not expose a server profile from another workspace', async () => {
    const response = await readProfile(new Request('http://localhost/api/ops/server-profiles/foreign', { headers: { cookie: sessionCookie } }), { params: Promise.resolve({ id: profileId }) })
    expect(response.status).toBe(404)
  })
})
