import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createWorkflowRepository } from '@/lib/workflows/repository'
import { runClaimedWorkflow } from '@/lib/workflows/worker'
import { createApprovalService } from '@/lib/approvals/service'
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

  it('resolves condition references and skips the inactive branch', async () => {
    const claimed = await queued({ schemaVersion: 1, name: 'Condition', nodes: [
      { id: 'check', type: 'condition', name: 'Check', config: { left: '$trigger.release', operator: 'falsy' } },
      { id: 'script', type: 'script', name: 'Script', config: { scriptId: 's' } },
    ], edges: [{ id: 'edge', source: 'check', sourcePort: 'true', target: 'script' }] })
    await runClaimedWorkflow(claimed!, repository, adapters)
    const run = await repository.getRun(claimed!.id)
    expect(run.nodeRuns.find((item) => item.nodeId === 'script')?.status).toBe('skipped')
  })

  it('persists the selected port and executes the branch after approval resume', async () => {
    const definition: WorkflowDefinition = {
      schemaVersion: 1, name: 'Resume',
      nodes: [
        { id: 'check', type: 'condition', name: 'Check', config: { left: '$trigger.release', operator: 'truthy' } },
        { id: 'approval', type: 'approval', name: 'Approve', config: { prompt: 'Ship?' } },
        { id: 'script', type: 'script', name: 'Script', config: { scriptId: 's' } },
      ],
      edges: [
        { id: 'e1', source: 'check', sourcePort: 'true', target: 'approval' },
        { id: 'e2', source: 'approval', target: 'script' },
      ],
    }
    const claimed = await queued(definition)
    await runClaimedWorkflow(claimed!, repository, adapters)
    const paused = await repository.getRun(claimed!.id)
    expect(paused.status).toBe('waiting_approval')
    const conditionRun = paused.nodeRuns.find((item) => item.nodeId === 'check')
    expect(conditionRun?.selectedPort).toBe('true')
    await repository.approveNode(claimed!.id, 'approval', 'tester')
    const resumed = await repository.claimNextRun('test-worker')
    await runClaimedWorkflow(resumed!, repository, adapters)
    const finished = await repository.getRun(claimed!.id)
    expect(finished.status).toBe('succeeded')
    expect(finished.nodeRuns.find((item) => item.nodeId === 'script')?.status).toBe('succeeded')
    expect(adapters.runScript).toHaveBeenCalled()
  })

  it('skips descendants of a failed node under a continue failure policy', async () => {
    const failing = { ...adapters, runScript: vi.fn(async () => { throw new Error('boom') }) }
    const claimed = await queued({ schemaVersion: 1, name: 'Continue', nodes: [
      { id: 'flaky', type: 'script', name: 'Flaky', config: { scriptId: 's' }, failurePolicy: { action: 'continue' } },
      { id: 'downstream', type: 'script', name: 'Downstream', config: { scriptId: 's2' } },
    ], edges: [{ id: 'edge', source: 'flaky', target: 'downstream' }] })
    await runClaimedWorkflow(claimed!, repository, failing)
    const run = await repository.getRun(claimed!.id)
    expect(run.nodeRuns.find((item) => item.nodeId === 'flaky')?.status).toBe('failed')
    expect(run.nodeRuns.find((item) => item.nodeId === 'downstream')?.status).toBe('skipped')
    expect(run.status).toBe('succeeded')
  })

  it('cancels a run while a node is still executing', async () => {
    const claimed = await queued({ schemaVersion: 1, name: 'LongWait', nodes: [
      { id: 'wait', type: 'delay', name: 'Wait', config: { durationMs: 60_000 } },
    ], edges: [] })
    const execution = runClaimedWorkflow(claimed!, repository, adapters)
    await new Promise((resolve) => setTimeout(resolve, 150))
    await repository.requestCancellation(claimed!.id)
    await execution
    const run = await repository.getRun(claimed!.id)
    expect(run.status).toBe('cancelled')
    expect(run.nodeRuns[0].status).toBe('cancelled')
  })

  it('creates approval requests scoped to the workflow workspace', async () => {
    const definition: WorkflowDefinition = {
      schemaVersion: 1, name: 'ScopedApproval',
      nodes: [{ id: 'approval', type: 'approval', name: 'Approve', config: { prompt: 'Deploy?' } }],
      edges: [],
    }
    const workflow = await repository.createDraft({ name: definition.name, definition, workspaceId: 'ws-ops' })
    const version = await repository.publish(workflow.id)
    await repository.enqueueRun({ workflowId: workflow.id, versionId: version.id, triggerType: 'manual', actorId: 'user-7', payload: {} })
    const claimed = await repository.claimNextRun('test-worker')
    await runClaimedWorkflow(claimed!, repository, adapters)
    const request = await prisma.approvalRequest.findFirst({ where: { runId: claimed!.id } })
    expect(request?.workspaceId).toBe('ws-ops')
    expect(request?.actorId).toBe('user-7')
  })

  it('waits the configured backoff between retry attempts', async () => {
    let firstAttemptAt = 0
    let secondAttemptAt = 0
    const flakyOnce = {
      ...adapters,
      runScript: vi.fn(async () => {
        if (!firstAttemptAt) { firstAttemptAt = Date.now(); throw new Error('transient') }
        secondAttemptAt = Date.now()
        return { exitCode: 0 }
      }),
    }
    const claimed = await queued({ schemaVersion: 1, name: 'Backoff', nodes: [
      { id: 'flaky', type: 'script', name: 'Flaky', config: { scriptId: 's' }, retry: { maxAttempts: 2, delayMs: 150, backoff: 'fixed' } },
    ], edges: [] })
    await runClaimedWorkflow(claimed!, repository, flakyOnce)
    expect(secondAttemptAt).toBeGreaterThan(0)
    expect(secondAttemptAt - firstAttemptAt).toBeGreaterThanOrEqual(100)
    const run = await repository.getRun(claimed!.id)
    expect(run.status).toBe('succeeded')
  })

  it('pauses agent nodes with a desktop-gated approval and resumes after approval', async () => {
    const agentAdapters = { ...adapters, runAgent: vi.fn(async () => ({ status: 'waiting_approval' as const, output: { desktopHostRequired: true } })) }
    const definition: WorkflowDefinition = {
      schemaVersion: 1, name: 'AgentGate',
      nodes: [
        { id: 'agent', type: 'agent', name: 'Agent', config: { profileId: 'p1', prompt: 'Summarize' } },
        { id: 'after', type: 'transform', name: 'After', config: { mappings: { note: '$nodes.agent.approved' } } },
      ],
      edges: [{ id: 'edge', source: 'agent', target: 'after' }],
    }
    const workflow = await repository.createDraft({ name: definition.name, definition })
    const version = await repository.publish(workflow.id)
    await repository.enqueueRun({ workflowId: workflow.id, versionId: version.id, triggerType: 'manual', actorId: 'admin', payload: {} })
    const claimed = await repository.claimNextRun('test-worker')
    await runClaimedWorkflow(claimed!, repository, agentAdapters)
    const paused = await repository.getRun(claimed!.id)
    expect(paused.status).toBe('waiting_approval')
    const request = await prisma.approvalRequest.findFirstOrThrow({ where: { runId: claimed!.id, nodeId: 'agent' } })
    expect(request.operation).toContain('[agent]')
    expect(request.reason).toContain('desktop')
    await repository.approveNode(claimed!.id, 'agent', 'approver-1')
    const resumed = await repository.claimNextRun('test-worker')
    await runClaimedWorkflow(resumed!, repository, agentAdapters)
    const finished = await repository.getRun(claimed!.id)
    expect(finished.status).toBe('succeeded')
    expect(JSON.parse(finished.outputJson ?? '{}')).toEqual({
      agent: { approved: true, actorId: 'approver-1' },
      after: { note: true },
    })
  })

  it('executes same-layer nodes concurrently instead of sequentially', async () => {
    const started: string[] = []
    const parallelAdapters = {
      ...adapters,
      runScript: vi.fn(async (config: { scriptId: string }) => {
        started.push(config.scriptId)
        await new Promise((resolve) => setTimeout(resolve, 500))
        return { exitCode: 0 }
      }),
    }
    const claimed = await queued({ schemaVersion: 1, name: 'Parallel', nodes: [
      { id: 'a', type: 'script', name: 'A', config: { scriptId: 'a' } },
      { id: 'b', type: 'script', name: 'B', config: { scriptId: 'b' } },
      { id: 'c', type: 'script', name: 'C', config: { scriptId: 'c' } },
    ], edges: [] })
    const began = Date.now()
    await runClaimedWorkflow(claimed!, repository, parallelAdapters)
    const elapsed = Date.now() - began
    expect(started.sort()).toEqual(['a', 'b', 'c'])
    expect(elapsed).toBeLessThan(1000)
    const run = await repository.getRun(claimed!.id)
    expect(run.status).toBe('succeeded')
  })

  it('fails the run when an approval is rejected via the decision service', async () => {
    const definition: WorkflowDefinition = {
      schemaVersion: 1, name: 'Rejectable',
      nodes: [
        { id: 'approval', type: 'approval', name: 'Approve', config: { prompt: 'Deploy?' } },
        { id: 'script', type: 'script', name: 'Script', config: { scriptId: 's' } },
      ],
      edges: [{ id: 'edge', source: 'approval', target: 'script' }],
    }
    const workflow = await repository.createDraft({ name: definition.name, definition })
    const version = await repository.publish(workflow.id)
    await repository.enqueueRun({ workflowId: workflow.id, versionId: version.id, triggerType: 'manual', actorId: 'admin', payload: {} })
    const claimed = await repository.claimNextRun('test-worker')
    const untouchedScript = vi.fn(async () => ({ exitCode: 0 }))
    await runClaimedWorkflow(claimed!, repository, { ...adapters, runScript: untouchedScript })
    const pending = await prisma.approvalRequest.findFirstOrThrow({ where: { runId: claimed!.id, nodeId: 'approval' } })
    await createApprovalService(prisma).decide(pending.id, 'reject', 'guardian')
    const run = await repository.getRun(claimed!.id)
    expect(run.status).toBe('failed')
    expect(run.nodeRuns.find((item) => item.nodeId === 'approval')?.errorJson).toContain('Approval rejected')
    expect(untouchedScript).not.toHaveBeenCalled()
  })
})
