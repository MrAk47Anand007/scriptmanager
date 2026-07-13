import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'

describe('approval service', () => {
  beforeEach(async () => { await prisma.approvalDecision.deleteMany(); await prisma.approvalGrant.deleteMany(); await prisma.approvalRequest.deleteMany(); await prisma.executionEvent.deleteMany() })
  it('persists a scoped decision and audit events', async () => {
    const service = createApprovalService(prisma)
    const request = await service.create({ actorType:'agent', actorId:'agent:1', workspaceId:'ws', capability:'filesystem.write', operation:'write file', resource:'src/app', risk:'high', correlationId:'corr_phase4', expiresAt:new Date(Date.now()+60_000) })
    const decided = await service.decide(request.id, 'allow_workspace', 'user:1')
    expect(decided?.status).toBe('approved')
    expect(await prisma.approvalGrant.count()).toBe(1)
    expect(await prisma.executionEvent.count({ where: { correlationId:'corr_phase4' } })).toBe(2)
  })
  it('expires stale requests instead of authorizing them', async () => {
    const service = createApprovalService(prisma)
    const request = await service.create({ actorType:'agent', actorId:'agent:1', workspaceId:'ws', capability:'x', operation:'x', resource:'x', risk:'low', correlationId:'corr_expired', expiresAt:new Date(0) })
    await expect(service.decide(request.id, 'allow_once', 'user:1')).rejects.toThrow('expired')
    expect((await service.get(request.id))?.status).toBe('expired')
  })
})
