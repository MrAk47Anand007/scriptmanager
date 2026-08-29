import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { POST } from '@/app/api/projects/[id]/git/route'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'

let projectId = ''
let sessionId = ''
let sessionCookie = ''

describe('Git route authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.approvalDecision.deleteMany()
    await prisma.approvalRequest.deleteMany()
    const project = await prisma.project.create({
      data: { workspaceId: 'default', name: `Git route ${crypto.randomUUID()}`, repositoryRoot: process.cwd() },
    })
    projectId = project.id

    sessionId = crypto.randomUUID()
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
    await prisma.approvalRequest.deleteMany()
    await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined)
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated Git requests before touching the project', async () => {
    const response = await POST(new Request('http://localhost/api/projects/git', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    }), { params: Promise.resolve({ id: projectId }) })

    expect(response.status).toBe(401)
  })

  it('uses the trusted session actor and project workspace for approvals', async () => {
    const response = await POST(new Request('http://localhost/api/projects/git', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'push', branch: 'main', actor_type: 'agent', actor_id: 'forged-actor' }),
    }), { params: Promise.resolve({ id: projectId }) })

    expect(response.status).toBe(202)
    const approval = await prisma.approvalRequest.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })
    expect(approval).toMatchObject({ actorType: 'user', actorId: 'local-admin', workspaceId: 'default' })
  })
})
