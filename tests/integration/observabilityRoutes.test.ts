import crypto from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as dashboard } from '@/app/api/observability/dashboard/route'
import { GET as detail } from '@/app/api/observability/runs/[kind]/[id]/route'
import { POST as retry } from '@/app/api/observability/runs/[kind]/[id]/retry/route'

const context = (kind: string, id: string) => ({ params: Promise.resolve({ kind, id }) })
let sessionCookie = ''

beforeEach(async () => {
  await ensureDefaultWorkspace(prisma)
  await prisma.executionEvent.deleteMany({ where: { correlationId: 'corr_observability_test' } })
  await prisma.workflow.deleteMany({ where: { name: { in: ['Observability route test', 'Foreign observability workflow'] } } })
  const sessionId = crypto.randomUUID()
  const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
  await prisma.userSession.create({ data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) } })
  sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
})
afterAll(async () => { await prisma.userSession.deleteMany({ where: { userId: 'local-admin' } }); await prisma.$disconnect() })

describe('observability routes', () => {
  it('rejects unauthenticated observability reads', async () => {
    expect((await dashboard(new Request('http://localhost/api/observability/dashboard'))).status).toBe(401)
  })

  it('returns redacted causal detail and retries only the failed node', async () => {
    const workflow = await prisma.workflow.create({ data: { name: 'Observability route test', draftDefinition: '{}' } })
    const version = await prisma.workflowVersion.create({ data: { workflowId: workflow.id, version: 1, definitionJson: JSON.stringify({ schemaVersion: 1, name: workflow.name, nodes: [{ id: 'safe', type: 'delay', name: 'Safe', config: { durationMs: 1 } }, { id: 'failed', type: 'delay', name: 'Failed', config: { durationMs: 1 } }], edges: [{ id: 'edge', source: 'safe', target: 'failed' }] }) } })
    const run = await prisma.workflowRun.create({ data: { workflowId: workflow.id, versionId: version.id, status: 'failed', triggerType: 'cron', actorId: 'system', correlationId: 'corr_observability_test', inputJson: JSON.stringify({ token: 'secret-token' }), startedAt: new Date('2026-07-13T00:00:00Z'), finishedAt: new Date('2026-07-13T00:00:01Z') } })
    await prisma.workflowNodeRun.createMany({ data: [{ runId: run.id, nodeId: 'safe', nodeType: 'delay', status: 'succeeded', attempt: 1 }, { runId: run.id, nodeId: 'failed', nodeType: 'delay', status: 'failed', attempt: 2, errorJson: JSON.stringify({ password: 'secret-password' }) }] })
    await prisma.executionEvent.create({ data: { id: 'evt_observability_test', type: 'execution.failed', executionKind: 'workflow', correlationId: run.correlationId, occurredAt: new Date(), actorType: 'system', actorId: 'worker', targetType: 'workflow', targetId: workflow.id, dataJson: JSON.stringify({ authorization: 'Bearer secret' }) } })

    const dashboardBody = await (await dashboard(new Request('http://localhost/api/observability/dashboard?kind=workflow', { headers: { cookie: sessionCookie } }))).json()
    expect(dashboardBody.metrics.failed).toBeGreaterThanOrEqual(1)
    const detailResponse = await detail(new Request('http://localhost/detail', { headers: { cookie: sessionCookie } }), context('workflow', run.id))
    const detailBody = await detailResponse.json()
    expect(detailBody.input.token).toBe('[REDACTED]')
    expect(detailBody.nodeRuns.find((node: { nodeId: string }) => node.nodeId === 'failed').error.password).toBe('[REDACTED]')
    expect(detailBody.events[0].data.authorization).toBe('[REDACTED]')

    expect((await retry(new Request('http://localhost/retry', { method: 'POST', headers: { cookie: sessionCookie }, body: '{}' }), context('workflow', run.id))).status).toBe(200)
    const nodes = await prisma.workflowNodeRun.findMany({ where: { runId: run.id } })
    expect(nodes.find(node => node.nodeId === 'safe')?.status).toBe('succeeded')
    expect(nodes.find(node => node.nodeId === 'failed')?.status).toBe('pending')
  })

  it('does not expose a workflow run from another workspace', async () => {
    const foreignWorkflow = await prisma.workflow.create({ data: { name: 'Foreign observability workflow', workspaceId: 'foreign-workspace', draftDefinition: '{}' } })
    const version = await prisma.workflowVersion.create({ data: { workflowId: foreignWorkflow.id, version: 1, definitionJson: '{}' } })
    const run = await prisma.workflowRun.create({ data: { workflowId: foreignWorkflow.id, versionId: version.id, status: 'failed', triggerType: 'manual', actorId: 'other-user', correlationId: `corr_${crypto.randomUUID()}` } })

    const response = await detail(new Request('http://localhost/detail', { headers: { cookie: sessionCookie } }), context('workflow', run.id))
    expect(response.status).toBe(404)
  })
})
