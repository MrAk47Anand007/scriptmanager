import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { authorizeAgentAction } from '@/lib/agents/approvalRouter'

beforeEach(async () => { await prisma.approvalDecision.deleteMany(); await prisma.approvalRequest.deleteMany(); await prisma.approvalGrant.deleteMany() })

describe('agent approval router', () => {
  it('allows reads, denies actions outside profile, and pauses routed actions', async () => {
    const base = { actorId: 'agent-1', workspaceId: 'default', runId: 'run-1', correlationId: 'corr-1', operation: 'perform', resource: 'C:/workspace/src/a.ts' }
    expect(await authorizeAgentAction(prisma, { ...base, accessLevel: 'observe', capability: 'file.read' })).toEqual({ status: 'allowed' })
    expect(await authorizeAgentAction(prisma, { ...base, accessLevel: 'observe', capability: 'file.write' })).toMatchObject({ status: 'denied' })
    const waiting = await authorizeAgentAction(prisma, { ...base, accessLevel: 'develop', capability: 'file.write' })
    expect(waiting.status).toBe('waiting_approval')
    expect(await prisma.approvalRequest.count({ where: { actorId: 'agent-1', capability: 'file.write' } })).toBe(1)
  })

  it('never consumes a workspace grant for protected actions', async () => {
    await prisma.approvalGrant.create({ data: { actorId: 'agent-1', workspaceId: 'default', capability: 'deploy.execute', resource: 'prod', policyVersion: 1, createdBy: 'user' } })
    const result = await authorizeAgentAction(prisma, { actorId: 'agent-1', workspaceId: 'default', runId: 'run-2', correlationId: 'corr-2', accessLevel: 'full', capability: 'deploy.execute', operation: 'deploy', resource: 'prod' })
    expect(result.status).toBe('waiting_approval')
  })
})
