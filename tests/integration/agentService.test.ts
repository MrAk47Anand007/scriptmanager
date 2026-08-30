import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createAgentService } from '@/lib/agents/service'
import { FakeAcpProviderAdapter } from '@/lib/agents/provider'
import { createApprovalService } from '@/lib/approvals/service'

beforeEach(async () => { await prisma.agentArtifact.deleteMany(); await prisma.agentMessage.deleteMany(); await prisma.permissionGrant.deleteMany(); await prisma.agentRun.deleteMany(); await prisma.agentProfile.deleteMany(); await prisma.agentProviderConfig.deleteMany() })

describe('agent service', () => {
  it('launches either provider, streams durable output, interrupts, and resumes', async () => {
    const codex = new FakeAcpProviderAdapter('codex'); const claude = new FakeAcpProviderAdapter('claude')
    const service = createAgentService(prisma, { codex, claude })
    const config = await service.createProviderConfig({ provider: 'codex', name: 'Codex', executable: 'codex' })
    const profile = await service.createProfile({ name: 'Dev', provider: 'codex', providerConfigId: config.id, accessLevel: 'develop', workspaceId: 'default' })
    const run = await service.launch({ profileId: profile.id, prompt: 'inspect', cwd: 'C:/workspace', desktopHost: true })
    await codex.emit(run.providerSessionId!, { type: 'message', message: { role: 'assistant', content: 'done' } })
    await service.interrupt(run.id, 'default')
    expect((await service.getRun(run.id))?.messages.some((message) => message.role === 'assistant' && message.content === 'done')).toBe(true)
    expect((await service.getRun(run.id))?.status).toBe('interrupted')
    await service.resume(run.id, 'continue', 'default')
    expect((await service.getRun(run.id))?.status).toBe('running')
  })

  it('rejects run controls from another workspace', async () => {
    const codex = new FakeAcpProviderAdapter('codex')
    const service = createAgentService(prisma, { codex, claude: new FakeAcpProviderAdapter('claude') })
    const config = await service.createProviderConfig({ provider: 'codex', name: 'Codex', executable: 'codex' })
    const profile = await service.createProfile({ name: 'Dev', provider: 'codex', providerConfigId: config.id, accessLevel: 'develop', workspaceId: 'default' })
    const run = await service.launch({ profileId: profile.id, prompt: 'inspect', cwd: '.', desktopHost: true })

    await expect(service.interrupt(run.id, 'foreign-workspace')).rejects.toThrow('Agent run not found')
    await expect(service.resume(run.id, 'continue', 'foreign-workspace')).rejects.toThrow('Agent run not found')
    await expect(service.terminate(run.id, 'foreign-workspace')).rejects.toThrow('Agent run not found')
    expect((await service.getRun(run.id))?.status).toBe('running')
  })

  it('does not treat provider stderr diagnostics as an interrupted run', async () => {
    const codex = new FakeAcpProviderAdapter('codex')
    const service = createAgentService(prisma, { codex, claude: new FakeAcpProviderAdapter('claude') })
    const config = await service.createProviderConfig({ provider: 'codex', name: 'Codex', executable: 'codex' })
    const profile = await service.createProfile({ name: 'Dev', provider: 'codex', providerConfigId: config.id, accessLevel: 'develop', workspaceId: 'default' })
    const run = await service.launch({ profileId: profile.id, prompt: 'inspect', cwd: '.', desktopHost: true })

    await codex.emit(run.providerSessionId!, { type: 'error', error: { code: 'provider_stderr', message: 'diagnostic output', recoverable: true } })

    expect((await service.getRun(run.id))?.status).toBe('running')
    expect((await service.getRun(run.id))?.errorJson).toBeNull()
  })

  it('refuses local provider launch in browser-only mode', async () => {
    const service = createAgentService(prisma, { codex: new FakeAcpProviderAdapter('codex'), claude: new FakeAcpProviderAdapter('claude') })
    const config = await service.createProviderConfig({ provider: 'claude', name: 'Claude', executable: 'claude' })
    const profile = await service.createProfile({ name: 'Observe', provider: 'claude', providerConfigId: config.id, accessLevel: 'observe', workspaceId: 'default' })
    await expect(service.launch({ profileId: profile.id, prompt: 'inspect', cwd: '.', desktopHost: false })).rejects.toThrow('desktop host')
  })

  it('waits for a local ACP session to reach a terminal state', async () => {
    const codex = new FakeAcpProviderAdapter('codex')
    const service = createAgentService(prisma, { codex, claude: new FakeAcpProviderAdapter('claude') })
    const config = await service.createProviderConfig({ provider: 'codex', name: 'Codex', executable: 'codex' })
    const profile = await service.createProfile({ name: 'Dev', provider: 'codex', providerConfigId: config.id, accessLevel: 'develop', workspaceId: 'default' })
    const run = await service.launch({ profileId: profile.id, prompt: 'inspect', cwd: '.', desktopHost: true })
    const completion = service.waitForCompletion(run.id)

    await codex.emit(run.providerSessionId!, { type: 'message', message: { role: 'assistant', content: 'done' } })
    await codex.emit(run.providerSessionId!, { type: 'state', state: 'terminated' })

    await expect(completion).resolves.toMatchObject({ id: run.id, status: 'terminated' })
  })

  it('persists successful ACP turns as finished runs', async () => {
    const codex = new FakeAcpProviderAdapter('codex')
    const service = createAgentService(prisma, { codex, claude: new FakeAcpProviderAdapter('claude') })
    const config = await service.createProviderConfig({ provider: 'codex', name: 'Codex', executable: 'codex' })
    const profile = await service.createProfile({ name: 'Dev', provider: 'codex', providerConfigId: config.id, accessLevel: 'develop', workspaceId: 'default' })
    const run = await service.launch({ profileId: profile.id, prompt: 'inspect', cwd: '.', desktopHost: true })

    await codex.emit(run.providerSessionId!, { type: 'state', state: 'succeeded' })

    const durable = await service.getRun(run.id)
    expect(durable?.status).toBe('succeeded')
    expect(durable?.finishedAt).toBeInstanceOf(Date)
  })

  it('routes permission approvals back to the active ACP session', async () => {
    const codex = new FakeAcpProviderAdapter('codex')
    const service = createAgentService(prisma, { codex, claude: new FakeAcpProviderAdapter('claude') })
    const config = await service.createProviderConfig({ provider: 'codex', name: 'Codex', executable: 'codex' })
    const profile = await service.createProfile({ name: 'Dev', provider: 'codex', providerConfigId: config.id, accessLevel: 'develop', workspaceId: 'default' })
    const run = await service.launch({ profileId: profile.id, prompt: 'write a file', cwd: '.', desktopHost: true })
    await codex.emit(run.providerSessionId!, { type: 'permission_request', request: { id: 'provider-request-1', capability: 'file.write', operation: 'write file', resource: 'README.md', protectedAction: false } })
    const request = await prisma.approvalRequest.findFirstOrThrow({ where: { runId: run.id, status: 'pending' } })
    const completion = service.waitForCompletion(run.id)

    await createApprovalService(prisma).decide(request.id, 'allow_once', 'approver-1')
    await vi.waitFor(async () => expect((await service.getRun(run.id))?.status).toBe('running'))
    expect(codex.inputs(run.providerSessionId!).some((message) => message.content.includes('provider-request-1') && message.content.includes('true'))).toBe(true)
    await codex.emit(run.providerSessionId!, { type: 'state', state: 'terminated' })

    await expect(completion).resolves.toMatchObject({ id: run.id, status: 'terminated' })
    expect((await prisma.permissionGrant.findFirstOrThrow({ where: { runId: run.id } })).decision).toBe('approved')
  })
})
