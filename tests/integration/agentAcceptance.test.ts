import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createAgentService } from '@/lib/agents/service'
import { FakeAcpProviderAdapter } from '@/lib/agents/provider'
import { executeWorkflowNode } from '@/lib/workflows/nodeExecutors'
import type { WorkflowAdapters } from '@/lib/workflows/adapters'

beforeEach(async () => {
  await prisma.approvalDecision.deleteMany(); await prisma.permissionGrant.deleteMany(); await prisma.approvalRequest.deleteMany(); await prisma.approvalGrant.deleteMany()
  await prisma.agentArtifact.deleteMany(); await prisma.agentMessage.deleteMany(); await prisma.agentRun.deleteMany(); await prisma.agentProfile.deleteMany(); await prisma.agentProviderConfig.deleteMany()
})

describe('Phase 6 ACP acceptance', () => {
  it.each(['codex', 'claude'] as const)('runs one workflow agent contract through %s with audit and protected approval', async (provider) => {
    const codex = new FakeAcpProviderAdapter('codex'); const claude = new FakeAcpProviderAdapter('claude'); const service = createAgentService(prisma, { codex, claude }); const selected = provider === 'codex' ? codex : claude
    const config = await service.createProviderConfig({ provider, name: provider, executable: `${provider}-acp`, credentialRef: `secret://provider/${provider}` })
    const profile = await service.createProfile({ name: `${provider} full`, provider, providerConfigId: config.id, accessLevel: 'full', workspaceId: 'default' })
    let runId = ''
    const adapters: WorkflowAdapters = { runScript: vi.fn(), runApiRequest: vi.fn(), runRemoteCommand: vi.fn(), sendNotification: vi.fn(), runAgent: async (nodeConfig, input) => {
      const run = await service.launch({ profileId: String(nodeConfig.profileId), prompt: String(nodeConfig.prompt), cwd: 'C:/workspace', desktopHost: true, input }); runId = run.id
      await selected.emit(run.id, { type: 'message', message: { role: 'assistant', content: `${provider} complete` } })
      await selected.emit(run.id, { type: 'artifact', artifact: { id: 'artifact-1', kind: 'report', name: 'result.md', content: 'auditable output' } })
      await selected.emit(run.id, { type: 'usage', usage: { inputTokens: 8, outputTokens: 3, costUsd: 0.001 } })
      await selected.emit(run.id, { type: 'permission_request', request: { id: 'permission-1', capability: 'deploy.execute', operation: 'deploy', resource: 'production', protectedAction: true } })
      const durable = await service.getRun(run.id)
      return { status: durable?.status === 'waiting_approval' ? 'waiting_approval' : 'succeeded', output: { runId: run.id, artifacts: durable?.artifacts } }
    } }
    const result = await executeWorkflowNode({ id: 'agent', type: 'agent', name: 'Release review', config: { profileId: profile.id, provider, prompt: 'Review {{release}}' } }, { release: 'v1' }, adapters)
    expect(result.status).toBe('waiting_approval')
    const durable = await service.getRun(runId)
    expect(durable?.messages.some(message => message.content === `${provider} complete`)).toBe(true)
    expect(durable?.artifacts[0].name).toBe('result.md')
    expect(durable?.usageJson).toContain('inputTokens')
    expect(await prisma.approvalRequest.count({ where: { runId, protectedAction: true } })).toBe(1)
  })
})
