import { describe, expect, it, vi } from 'vitest'
import { executeWorkflowNode } from '@/lib/workflows/nodeExecutors'
import type { WorkflowAdapters } from '@/lib/workflows/adapters'

const base: WorkflowAdapters = {
  runScript: vi.fn(), runApiRequest: vi.fn(), runRemoteCommand: vi.fn(), sendNotification: vi.fn(),
  runAgent: vi.fn(async (config, input) => ({ status: 'succeeded' as const, output: { provider: config.provider, prompt: config.prompt, input, artifacts: [{ name: 'report.md' }] } })),
}

describe('workflow agent node', () => {
  it('routes provider-neutral prompt, structured input, and artifacts', async () => {
    const result = await executeWorkflowNode({ id: 'agent', type: 'agent', name: 'Review', config: { profileId: 'p1', provider: 'claude', prompt: 'Review {{topic}}', captureArtifacts: true } }, { topic: 'security' }, base)
    expect(result).toMatchObject({ status: 'succeeded', output: { provider: 'claude', artifacts: [{ name: 'report.md' }] } })
    expect(base.runAgent).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Review security' }), { topic: 'security' }, undefined)
  })

  it('propagates approval pause from the agent runtime', async () => {
    const adapters = { ...base, runAgent: vi.fn(async () => ({ status: 'waiting_approval' as const, output: { requestId: 'approval-1' } })) }
    await expect(executeWorkflowNode({ id: 'agent', type: 'agent', name: 'Deploy', config: { profileId: 'p1', prompt: 'Deploy' } }, {}, adapters)).resolves.toMatchObject({ status: 'waiting_approval' })
  })
})
