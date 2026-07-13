import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { GET as dashboard } from '@/app/api/observability/dashboard/route'
import { GET as detail } from '@/app/api/observability/runs/[kind]/[id]/route'
import { POST as retry } from '@/app/api/observability/runs/[kind]/[id]/retry/route'

const context = (kind: string, id: string) => ({ params: Promise.resolve({ kind, id }) })

beforeEach(async () => { await prisma.executionEvent.deleteMany({ where: { correlationId: 'corr_observability_test' } }); await prisma.workflow.deleteMany({ where: { name: 'Observability route test' } }) })
afterAll(async () => prisma.$disconnect())

describe('observability routes', () => {
  it('returns redacted causal detail and retries only the failed node', async () => {
    const workflow = await prisma.workflow.create({ data: { name: 'Observability route test', draftDefinition: '{}' } })
    const version = await prisma.workflowVersion.create({ data: { workflowId: workflow.id, version: 1, definitionJson: JSON.stringify({ schemaVersion: 1, name: workflow.name, nodes: [{ id: 'safe', type: 'delay', name: 'Safe', config: { durationMs: 1 } }, { id: 'failed', type: 'delay', name: 'Failed', config: { durationMs: 1 } }], edges: [{ id: 'edge', source: 'safe', target: 'failed' }] }) } })
    const run = await prisma.workflowRun.create({ data: { workflowId: workflow.id, versionId: version.id, status: 'failed', triggerType: 'cron', actorId: 'system', correlationId: 'corr_observability_test', inputJson: JSON.stringify({ token: 'secret-token' }), startedAt: new Date('2026-07-13T00:00:00Z'), finishedAt: new Date('2026-07-13T00:00:01Z') } })
    await prisma.workflowNodeRun.createMany({ data: [{ runId: run.id, nodeId: 'safe', nodeType: 'delay', status: 'succeeded', attempt: 1 }, { runId: run.id, nodeId: 'failed', nodeType: 'delay', status: 'failed', attempt: 2, errorJson: JSON.stringify({ password: 'secret-password' }) }] })
    await prisma.executionEvent.create({ data: { id: 'evt_observability_test', type: 'execution.failed', executionKind: 'workflow', correlationId: run.correlationId, occurredAt: new Date(), actorType: 'system', actorId: 'worker', targetType: 'workflow', targetId: workflow.id, dataJson: JSON.stringify({ authorization: 'Bearer secret' }) } })

    const dashboardBody = await (await dashboard(new Request('http://localhost/api/observability/dashboard?kind=workflow'))).json()
    expect(dashboardBody.metrics.failed).toBeGreaterThanOrEqual(1)
    const detailResponse = await detail(new Request('http://localhost/detail'), context('workflow', run.id))
    const detailBody = await detailResponse.json()
    expect(detailBody.input.token).toBe('[REDACTED]')
    expect(detailBody.nodeRuns.find((node: { nodeId: string }) => node.nodeId === 'failed').error.password).toBe('[REDACTED]')
    expect(detailBody.events[0].data.authorization).toBe('[REDACTED]')

    expect((await retry(new Request('http://localhost/retry', { method: 'POST', body: '{}' }), context('workflow', run.id))).status).toBe(200)
    const nodes = await prisma.workflowNodeRun.findMany({ where: { runId: run.id } })
    expect(nodes.find(node => node.nodeId === 'safe')?.status).toBe('succeeded')
    expect(nodes.find(node => node.nodeId === 'failed')?.status).toBe('pending')
  })
})
