import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { createApprovalService } from '@/lib/approvals/service'
import { GET } from '@/app/api/approvals/route'
import { POST } from '@/app/api/approvals/[id]/decision/route'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'

let sessionCookie = ''

describe('approval routes', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.notificationDelivery.deleteMany()
    await prisma.approvalDecision.deleteMany()
    await prisma.approvalGrant.deleteMany()
    await prisma.approvalRequest.deleteMany()
    await prisma.executionEvent.deleteMany()

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

  it('lists pending requests and ignores forged decidedBy values', async () => {
    const item = await createApprovalService(prisma).create({
      actorType: 'agent',
      actorId: 'agent-1',
      workspaceId: 'default',
      capability: 'read',
      operation: 'inspect',
      resource: 'src',
      risk: 'low',
      correlationId: 'route_corr',
      expiresAt: new Date(Date.now() + 60_000),
    })

    const list = await GET(new Request('http://localhost/api/approvals', { headers: { cookie: sessionCookie } }))
    expect((await list.json())).toHaveLength(1)

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ decision: 'allow_once', decidedBy: 'forged-user' }),
    }), { params: Promise.resolve({ id: item.id }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      status: 'approved',
      decisions: [
        expect.objectContaining({
          decidedBy: 'local-admin',
        }),
      ],
    })
  })
})
