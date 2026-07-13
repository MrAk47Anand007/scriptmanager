import { describe, expect, it, vi } from 'vitest'
import { executeWorkflowNode, UnsupportedWorkflowNodeError } from '@/lib/workflows/nodeExecutors'
import type { WorkflowAdapters } from '@/lib/workflows/adapters'
import type { WorkflowNode } from '@/lib/workflows/types'

const adapters: WorkflowAdapters = {
  runScript: vi.fn(async (config, input) => ({ kind: 'script', config, input })),
  runApiRequest: vi.fn(async (config, input) => ({ kind: 'api', config, input })),
  runRemoteCommand: vi.fn(async (config, input) => ({ kind: 'remote', config, input })),
  sendNotification: vi.fn(async (config, input) => ({ kind: 'notification', config, input })),
}
const node = (type: WorkflowNode['type'], config: Record<string, unknown> = {}): WorkflowNode => ({ id: type, type, name: type, config })

describe('workflow node executors', () => {
  it.each([
    ['script', { scriptId: 'script-1' }, 'script'],
    ['api', { requestId: 'request-1' }, 'api'],
    ['remote', { scriptId: 'script-1', profileId: 'profile-1' }, 'remote'],
    ['notification', { channel: 'desktop', message: 'Done' }, 'notification'],
  ] as const)('routes %s nodes through an injected adapter', async (type, config, kind) => {
    await expect(executeWorkflowNode(node(type, config), { value: 1 }, adapters)).resolves.toMatchObject({ status: 'succeeded', output: { kind } })
  })

  it('evaluates conditions without arbitrary code execution', async () => {
    await expect(executeWorkflowNode(node('condition', { left: 5, operator: 'greater_than', right: 2 }), {}, adapters)).resolves.toEqual({ status: 'succeeded', output: { result: true }, selectedPort: 'true' })
  })

  it('passes transforms, parallel branches, and joins through deterministically', async () => {
    await expect(executeWorkflowNode(node('transform', { mappings: { name: 'Ada' } }), {}, adapters)).resolves.toMatchObject({ output: { name: 'Ada' } })
    await expect(executeWorkflowNode(node('parallel'), { value: 1 }, adapters)).resolves.toMatchObject({ output: { value: 1 } })
    await expect(executeWorkflowNode(node('join'), { branches: [1, 2] }, adapters)).resolves.toMatchObject({ output: { branches: [1, 2] } })
  })

  it('pauses approval nodes and rejects agent execution until Phase 6', async () => {
    await expect(executeWorkflowNode(node('approval', { prompt: 'Deploy?' }), { release: 1 }, adapters)).resolves.toMatchObject({ status: 'waiting_approval' })
    await expect(executeWorkflowNode(node('agent', { profileId: 'a', prompt: 'Review' }), {}, adapters)).rejects.toBeInstanceOf(UnsupportedWorkflowNodeError)
  })

  it('supports cancellable delays', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(executeWorkflowNode(node('delay', { durationMs: 100 }), {}, adapters, controller.signal)).rejects.toThrow('cancelled')
  })
})
