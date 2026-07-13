import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createAgentRepository } from '@/lib/agents/repository'

const repository = createAgentRepository(prisma)

beforeEach(async () => {
  await prisma.agentArtifact.deleteMany(); await prisma.agentMessage.deleteMany(); await prisma.permissionGrant.deleteMany()
  await prisma.agentRun.deleteMany(); await prisma.agentProfile.deleteMany(); await prisma.agentProviderConfig.deleteMany()
})

describe('agent repository', () => {
  it('persists resumable redacted runs, artifacts, and usage without provider plaintext', async () => {
    const config = await repository.createProviderConfig({ provider: 'codex', name: 'Local Codex', executable: 'codex', credentialRef: 'secret://provider/codex' })
    const profile = await repository.createProfile({ name: 'Developer', provider: 'codex', providerConfigId: config.id, accessLevel: 'develop', workspaceId: 'default', model: 'gpt-5-codex' })
    const run = await repository.createRun({ profileId: profile.id, provider: 'codex', correlationId: 'corr-agent-1', workspaceId: 'default', input: { prompt: 'use TOKEN-123' }, secrets: ['TOKEN-123'] })
    await repository.appendMessage(run.id, { role: 'assistant', content: 'token TOKEN-123 processed' }, ['TOKEN-123'])
    await repository.appendArtifact(run.id, { id: 'artifact-1', kind: 'diff', name: 'change.patch', content: '+ TOKEN-123' }, ['TOKEN-123'])
    await repository.updateRun(run.id, { status: 'interrupted', usage: { inputTokens: 12, outputTokens: 5, costUsd: 0.01 } })

    const stored = await repository.getRun(run.id)
    expect(JSON.stringify(stored)).not.toContain('TOKEN-123')
    expect(stored?.messages[0].content).toContain('[REDACTED]')
    expect(stored?.artifacts[0].content).toContain('[REDACTED]')
    expect(stored?.usageJson).toContain('inputTokens')
    expect(config.credentialRef).toBe('secret://provider/codex')
  })
})
