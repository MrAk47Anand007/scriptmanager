import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkflowWorkerLoop, type WorkflowWorkerLoopOptions } from '@/lib/workflows/workerLoop'
import { runClaimedWorkflow } from '@/lib/workflows/worker'

vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/lib/workflows/runtimeAdapters', () => ({ createProductionWorkflowAdapters: vi.fn(() => ({})) }))
vi.mock('@/lib/workflows/worker', () => ({ runClaimedWorkflow: vi.fn() }))

const mockedRun = vi.mocked(runClaimedWorkflow)

type ClaimRecord = { id: string; workflow: { workspaceId: string } }

function fakeRepository(claims: Array<ClaimRecord | null>) {
  const queue = [...claims]
  return {
    claimNextRun: vi.fn(async () => queue.shift() ?? null),
    reconcileInterruptedRuns: vi.fn(async () => ({ count: 2 })),
    setRunStatus: vi.fn(async () => ({})),
  }
}

function buildLoop(repository: ReturnType<typeof fakeRepository>, overrides: Partial<WorkflowWorkerLoopOptions> = {}) {
  return createWorkflowWorkerLoop({ repository: repository as never, pollIntervalMs: 10, workerId: 'test-worker', logger: { log: vi.fn(), error: vi.fn() } as unknown as Console, ...overrides })
}

beforeEach(() => {
  mockedRun.mockReset()
  mockedRun.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('workflow worker loop', () => {
  it('drains every queued run until the queue is empty', async () => {
    const repository = fakeRepository([{ id: 'run-1', workflow: { workspaceId: 'default' } }, { id: 'run-2', workflow: { workspaceId: 'default' } }, null])
    const loop = buildLoop(repository)
    const processed = await loop.drain()
    expect(processed).toBe(2)
    expect(repository.claimNextRun).toHaveBeenCalledTimes(3)
    expect(mockedRun).toHaveBeenCalledTimes(2)
  })

  it('marks a crashed run failed and keeps draining', async () => {
    const repository = fakeRepository([{ id: 'run-1', workflow: { workspaceId: 'default' } }, { id: 'run-2', workflow: { workspaceId: 'default' } }, null])
    mockedRun.mockRejectedValueOnce(new Error('boom'))
    const loop = buildLoop(repository)
    const processed = await loop.drain()
    expect(processed).toBe(2)
    expect(repository.setRunStatus).toHaveBeenCalledWith('run-1', 'failed', undefined, { message: 'boom' })
    expect(mockedRun).toHaveBeenCalledTimes(2)
  })

  it('reports interrupted runs during reconciliation', async () => {
    const repository = fakeRepository([null])
    const loop = buildLoop(repository)
    await expect(loop.reconcile()).resolves.toBe(2)
    expect(repository.reconcileInterruptedRuns).toHaveBeenCalledOnce()
  })

  it('start reconciles once and polls until stopped', async () => {
    vi.useFakeTimers()
    const repository = fakeRepository([null])
    const loop = buildLoop(repository)
    loop.start()
    expect(loop.isRunning()).toBe(true)
    await vi.advanceTimersByTimeAsync(25)
    expect(repository.claimNextRun.mock.calls.length).toBeGreaterThanOrEqual(2)
    loop.stop()
    expect(loop.isRunning()).toBe(false)
    const callsAfterStop = repository.claimNextRun.mock.calls.length
    await vi.advanceTimersByTimeAsync(50)
    expect(repository.claimNextRun.mock.calls.length).toBe(callsAfterStop)
  })

  it('start is idempotent and stop clears the interval', async () => {
    vi.useFakeTimers()
    const repository = fakeRepository([null])
    const loop = buildLoop(repository)
    loop.start()
    loop.start()
    expect(loop.isRunning()).toBe(true)
    loop.stop()
    loop.stop()
    expect(loop.isRunning()).toBe(false)
  })
})
