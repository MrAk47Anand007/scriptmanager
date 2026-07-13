import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createAgentService } from '@/lib/agents/service'
import { FakeAcpProviderAdapter } from '@/lib/agents/provider'

beforeEach(async () => { await prisma.agentArtifact.deleteMany(); await prisma.agentMessage.deleteMany(); await prisma.permissionGrant.deleteMany(); await prisma.agentRun.deleteMany(); await prisma.agentProfile.deleteMany(); await prisma.agentProviderConfig.deleteMany() })

describe('agent service', () => {
  it('launches either provider, streams durable output, interrupts, and resumes', async () => {
    const codex = new FakeAcpProviderAdapter('codex'); const claude = new FakeAcpProviderAdapter('claude')
    const service = createAgentService(prisma, { codex, claude })
    const config = await service.createProviderConfig({ provider: 'codex', name: 'Codex', executable: 'codex' })
    const profile = await service.createProfile({ name: 'Dev', provider: 'codex', providerConfigId: config.id, accessLevel: 'develop', workspaceId: 'default' })
    const run = await service.launch({ profileId: profile.id, prompt: 'inspect', cwd: 'C:/workspace', desktopHost: true })
    await codex.emit(run.providerSessionId!, { type: 'message', message: { role: 'assistant', content: 'done' } })
    await service.interrupt(run.id)
    expect((await service.getRun(run.id))?.messages.some((message) => message.role === 'assistant' && message.content === 'done')).toBe(true)
    expect((await service.getRun(run.id))?.status).toBe('interrupted')
    await service.resume(run.id, 'continue')
    expect((await service.getRun(run.id))?.status).toBe('running')
  })

  it('refuses local provider launch in browser-only mode', async () => {
    const service = createAgentService(prisma, { codex: new FakeAcpProviderAdapter('codex'), claude: new FakeAcpProviderAdapter('claude') })
    const config = await service.createProviderConfig({ provider: 'claude', name: 'Claude', executable: 'claude' })
    const profile = await service.createProfile({ name: 'Observe', provider: 'claude', providerConfigId: config.id, accessLevel: 'observe', workspaceId: 'default' })
    await expect(service.launch({ profileId: profile.id, prompt: 'inspect', cwd: '.', desktopHost: false })).rejects.toThrow('desktop host')
  })
})
