import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workflowTrigger: { findUnique: vi.fn() },
    script: { findMany: vi.fn(async () => []) },
    setting: { findUnique: vi.fn(async () => null) },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/scriptRunner', () => ({ executeScriptAsync: vi.fn() }))
vi.mock('@/lib/execution', () => ({ createCorrelationId: () => 'corr_test', executionTelemetry: { emit: vi.fn() }, lifecycleEventType: (s: string) => s }))
vi.mock('@/lib/workflows/repository', () => ({ createWorkflowRepository: vi.fn(() => ({ enqueueRun: vi.fn() })) }))
vi.mock('@/lib/workflows/triggers', () => ({ createWorkflowTriggerService: vi.fn(() => ({ cron: vi.fn() })) }))
vi.mock('@/lib/workflows/workerLoop', () => ({ notifyWorkflowWorker: vi.fn() }))

import { isWorkflowCronScheduled, registerWorkflowCronTrigger, removeWorkflowCronTrigger } from '@/lib/schedulerService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('workflow cron trigger scheduling', () => {
  it('registers and unregisters a live cron job', () => {
    expect(isWorkflowCronScheduled('t1')).toBe(false)
    registerWorkflowCronTrigger({ id: 't1', workflowId: 'wf1', cron: '*/5 * * * *' })
    expect(isWorkflowCronScheduled('t1')).toBe(true)
    removeWorkflowCronTrigger('t1')
    expect(isWorkflowCronScheduled('t1')).toBe(false)
  })

  it('replaces an existing registration when re-registering', () => {
    registerWorkflowCronTrigger({ id: 't2', workflowId: 'wf1', cron: '* * * * *' })
    expect(isWorkflowCronScheduled('t2')).toBe(true)
    registerWorkflowCronTrigger({ id: 't2', workflowId: 'wf1', cron: '0 12 * * *' })
    expect(isWorkflowCronScheduled('t2')).toBe(true)
    removeWorkflowCronTrigger('t2')
    expect(isWorkflowCronScheduled('t2')).toBe(false)
  })

  it('rejects invalid cron expressions without registering', () => {
    expect(() => registerWorkflowCronTrigger({ id: 't3', workflowId: 'wf1', cron: 'not-a-cron' })).toThrow()
    expect(isWorkflowCronScheduled('t3')).toBe(false)
  })

  it('ignores removal of unknown trigger ids', () => {
    expect(() => removeWorkflowCronTrigger('missing')).not.toThrow()
    expect(isWorkflowCronScheduled('missing')).toBe(false)
  })
})
