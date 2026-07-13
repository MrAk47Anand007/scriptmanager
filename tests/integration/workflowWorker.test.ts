import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createWorkflowRepository } from '@/lib/workflows/repository'
import { runClaimedWorkflow } from '@/lib/workflows/worker'
import type { WorkflowAdapters } from '@/lib/workflows/adapters'
import type { WorkflowDefinition } from '@/lib/workflows/types'

const repository = createWorkflowRepository(prisma)
const adapters: WorkflowAdapters = {
  runScript: vi.fn(async () => ({ exitCode: 0 })),
  runApiRequest: vi.fn(async () => ({ status: 200 })),
  runRemoteCommand: vi.fn(async () => ({ exitCode: 0 })),
  sendNotification: vi.fn(async () => ({ delivered: true })),
}

async function queued(definition: WorkflowDefinition) {
  const workflow = await repository.createDraft({ name: definition.name, definition })
  const version = await repository.publish(workflow.id)
  await repository.enqueueRun({ workflowId: workflow.id, versionId: version.id, triggerType: 'manual', actorId: 'admin', payload: { release: 1 } })
  return repository.claimNextRun('test-worker')
}

beforeEach(async () => prisma.workflow.deleteMany())
afterAll(async () => prisma.$disconnect())

describe('workflow worker', () => {
  it('executes topological layers and persists outputs', async () => {
    const claimed = await queued({
      schemaVersion: 1, name: 'Run',
      nodes: [
        { id: 'transform', type: 'transform', name: 'Transform', config: { mappings: { release: '$trigger.release' } } },
        { id: 'script', type: 'script', name: 'Script', config: { scriptId: 'script-1' } },
      ],
      edges: [{ id: 'edge', source: 'transform', target: 'script' }],
    })
    await runClaimedWorkflow(claimed!, repository, adapters)
    const run = await repository.getRun(claimed!.id)
    expect(run.status).toBe('succeeded')
    expect(run.nodeRuns.map((node) => node.status)).toEqual(['succeeded', 'succeeded'])
    expect(adapters.runScript).toHaveBeenCalled()
  })

  it('pauses at approval nodes without executing descendants', async () => {
    const claimed = await queued({
      schemaVersion: 1, name: 'Approval',
      nodes: [
        { id: 'approval', type: 'approval', name: 'Approve', config: { prompt: 'Deploy?' } },
        { id: 'remote', type: 'remote', name: 'Remote', config: { scriptId: 's', profileId: 'p' } },
      ],
      edges: [{ id: 'edge', source: 'approval', target: 'remote' }],
    })
    await runClaimedWorkflow(claimed!, repository, adapters)
    const run = await repository.getRun(claimed!.id)
    expect(run.status).toBe('waiting_approval')
    expect(run.nodeRuns.find((node) => node.nodeId === 'remote')?.status).toBe('pending')
  })

  it('persists adapter failures on the node and run', async () => {
    const failing = { ...adapters, runScript: vi.fn(async () => { throw new Error('boom') }) }
    const claimed = await queued({ schemaVersion: 1, name: 'Fail', nodes: [{ id: 'script', type: 'script', name: 'Script', config: { scriptId: 's' } }], edges: [] })
    await runClaimedWorkflow(claimed!, repository, failing)
    const run = await repository.getRun(claimed!.id)
    expect(run.status).toBe('failed')
    expect(run.errorJson).toContain('boom')
    expect(run.nodeRuns[0].status).toBe('failed')
  })
})
