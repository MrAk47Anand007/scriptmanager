import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { POST as createWorkflow } from '@/app/api/workflows/route'
import { POST as validateWorkflow } from '@/app/api/workflows/[id]/validate/route'
import { POST as publishWorkflow } from '@/app/api/workflows/[id]/publish/route'
import { POST as runWorkflow } from '@/app/api/workflows/[id]/runs/route'
import { POST as cancelRun } from '@/app/api/workflow-runs/[id]/cancel/route'

const context = (id: string) => ({ params: Promise.resolve({ id }) })
const request = (url: string, body: unknown) => new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(async () => prisma.workflow.deleteMany())
afterAll(async () => prisma.$disconnect())

describe('workflow routes', () => {
  it('creates, validates, publishes, runs, and cancels a workflow', async () => {
    const definition = { schemaVersion: 1, name: 'Route flow', nodes: [{ id: 'wait', type: 'delay', name: 'Wait', config: { durationMs: 1 } }], edges: [] }
    const createdResponse = await createWorkflow(request('http://localhost/api/workflows', { name: 'Route flow', definition }))
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json()
    expect((await validateWorkflow(request('http://localhost/validate', {}), context(created.id))).status).toBe(200)
    expect((await publishWorkflow(new Request('http://localhost/publish', { method: 'POST' }), context(created.id))).status).toBe(201)
    const runResponse = await runWorkflow(request('http://localhost/runs', { input: {} }), context(created.id))
    expect(runResponse.status).toBe(202)
    const run = await runResponse.json()
    expect((await cancelRun(new Request('http://localhost/cancel', { method: 'POST' }), context(run.id))).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 25))
  })

  it('rejects publishing invalid cyclic graphs', async () => {
    const definition = { schemaVersion: 1, name: 'Cycle', nodes: [{ id: 'a', type: 'join', name: 'A', config: {} }, { id: 'b', type: 'join', name: 'B', config: {} }], edges: [{ id: '1', source: 'a', target: 'b' }, { id: '2', source: 'b', target: 'a' }] }
    const created = await (await createWorkflow(request('http://localhost/api/workflows', { name: 'Cycle', definition }))).json()
    expect((await publishWorkflow(new Request('http://localhost/publish', { method: 'POST' }), context(created.id))).status).toBe(422)
  })
})
