import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createWorkflowRepository } from '@/lib/workflows/repository'
import type { WorkflowDefinition } from '@/lib/workflows/types'

const definition: WorkflowDefinition = {
  schemaVersion: 1,
  name: 'Repository flow',
  nodes: [
    { id: 'first', type: 'delay', name: 'First', config: { durationMs: 1 } },
    { id: 'second', type: 'join', name: 'Second', config: {} },
  ],
  edges: [{ id: 'edge', source: 'first', target: 'second' }],
}

const repository = createWorkflowRepository(prisma)

beforeEach(async () => {
  await prisma.workflow.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('workflow repository', () => {
  it('creates and updates a draft before publishing an immutable version', async () => {
    const workflow = await repository.createDraft({ name: 'Draft', definition })
    await repository.updateDraft(workflow.id, { ...definition, name: 'Updated' })
    const version = await repository.publish(workflow.id)

    expect(version.version).toBe(1)
    expect(JSON.parse(version.definitionJson).name).toBe('Updated')

    await repository.updateDraft(workflow.id, { ...definition, name: 'Next draft' })
    const persisted = await prisma.workflowVersion.findUniqueOrThrow({ where: { id: version.id } })
    expect(JSON.parse(persisted.definitionJson).name).toBe('Updated')
  })

  it('enqueues node state and permits only one atomic claim', async () => {
    const workflow = await repository.createDraft({ name: 'Draft', definition })
    const version = await repository.publish(workflow.id)
    const run = await repository.enqueueRun({ workflowId: workflow.id, versionId: version.id, triggerType: 'manual', actorId: 'admin' })

    const [first, second] = await Promise.all([
      repository.claimNextRun('worker-a'),
      repository.claimNextRun('worker-b'),
    ])

    expect([first, second].filter(Boolean)).toHaveLength(1)
    expect((first ?? second)?.id).toBe(run.id)
    expect(await prisma.workflowNodeRun.count({ where: { runId: run.id } })).toBe(2)
  })

  it('persists node transitions, cancellation, and restart reconciliation', async () => {
    const workflow = await repository.createDraft({ name: 'Draft', definition })
    const version = await repository.publish(workflow.id)
    const run = await repository.enqueueRun({ workflowId: workflow.id, versionId: version.id, triggerType: 'manual', actorId: 'admin' })
    await repository.claimNextRun('worker-a')

    await repository.startNode(run.id, 'first', 1, { value: 'input' })
    await repository.finishNode(run.id, 'first', 1, 'succeeded', { value: 'output' })
    await repository.requestCancellation(run.id)
    expect((await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } })).cancelRequestedAt).not.toBeNull()

    await repository.reconcileInterruptedRuns()
    expect((await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe('interrupted')
    expect((await prisma.workflowNodeRun.findFirstOrThrow({ where: { runId: run.id, nodeId: 'first' } })).outputJson).toContain('output')
  })

  it('deduplicates trigger runs by idempotency key', async () => {
    const workflow = await repository.createDraft({ name: 'Draft', definition })
    const version = await repository.publish(workflow.id)
    const input = { workflowId: workflow.id, versionId: version.id, triggerType: 'webhook', actorId: 'webhook', idempotencyKey: 'same-request' }
    const first = await repository.enqueueRun(input)
    const second = await repository.enqueueRun(input)
    expect(second.id).toBe(first.id)
  })
})
