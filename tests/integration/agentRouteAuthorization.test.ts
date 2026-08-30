import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as listProfiles, POST as createProfile } from '@/app/api/agents/profiles/route'
import { GET as listProviders } from '@/app/api/agents/providers/route'
import { GET as listRuns, POST as createRun } from '@/app/api/agents/runs/route'
import { GET as readRun } from '@/app/api/agents/runs/[id]/route'
import { POST as interruptRun } from '@/app/api/agents/runs/[id]/interrupt/route'
import { POST as resumeRun } from '@/app/api/agents/runs/[id]/resume/route'
import { POST as appendMessage } from '@/app/api/agents/runs/[id]/messages/route'

let sessionId = ''
let sessionCookie = ''
let localProfileId = ''
let foreignProfileId = ''
let foreignRunId = ''

describe('agent route authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.agentArtifact.deleteMany()
    await prisma.agentMessage.deleteMany()
    await prisma.agentRun.deleteMany()
    await prisma.agentProfile.deleteMany()
    await prisma.agentProviderConfig.deleteMany()

    localProfileId = `local_profile_${crypto.randomUUID()}`
    foreignProfileId = `foreign_profile_${crypto.randomUUID()}`
    foreignRunId = `foreign_run_${crypto.randomUUID()}`
    const provider = await prisma.agentProviderConfig.create({ data: { provider: 'codex', name: 'Codex', executable: 'codex-acp' } })
    await prisma.agentProfile.create({ data: { id: localProfileId, name: 'Local profile', provider: 'codex', providerConfigId: provider.id, workspaceId: 'default', accessLevel: 'observe' } })
    await prisma.agentProfile.create({ data: { id: foreignProfileId, name: 'Foreign profile', provider: 'codex', providerConfigId: provider.id, workspaceId: 'foreign-workspace', accessLevel: 'observe' } })
    await prisma.agentRun.create({ data: { id: foreignRunId, profileId: foreignProfileId, provider: 'codex', workspaceId: 'foreign-workspace', correlationId: crypto.randomUUID(), inputJson: '{"prompt":"foreign"}' } })

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({ data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) } })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated agent API access', async () => {
    expect((await listProfiles(new Request('http://localhost/api/agents/profiles'))).status).toBe(401)
    expect((await listProviders(new Request('http://localhost/api/agents/providers'))).status).toBe(401)
    expect((await listRuns(new Request('http://localhost/api/agents/runs'))).status).toBe(401)
  })

  it('uses the authenticated workspace instead of forged headers', async () => {
    const response = await listProfiles(new Request('http://localhost/api/agents/profiles', { headers: { cookie: sessionCookie, 'x-scriptmanager-workspace-id': 'foreign-workspace' } }))
    expect(response.status).toBe(200)
    const profiles = await response.json() as Array<{ id: string }>
    expect(profiles.map((profile) => profile.id)).toContain(localProfileId)
    expect(profiles.map((profile) => profile.id)).not.toContain(foreignProfileId)
  })

  it('does not expose or mutate a run from another workspace', async () => {
    const headers = { cookie: sessionCookie, 'x-scriptmanager-desktop': '1', 'x-scriptmanager-workspace-id': 'foreign-workspace', 'x-scriptmanager-user-id': 'attacker' }
    const runsResponse = await listRuns(new Request('http://localhost/api/agents/runs', { headers }))
    expect(runsResponse.status).toBe(200)
    expect((await runsResponse.json() as Array<{ id: string }>).some((run) => run.id === foreignRunId)).toBe(false)

    const readResponse = await readRun(new Request(`http://localhost/api/agents/runs/${foreignRunId}`, { headers }), { params: Promise.resolve({ id: foreignRunId }) })
    expect(readResponse.status).toBe(404)

    const interruptResponse = await interruptRun(new Request(`http://localhost/api/agents/runs/${foreignRunId}/interrupt`, { headers }))
    expect(interruptResponse.status).toBe(409)

    const resumeResponse = await resumeRun(new Request(`http://localhost/api/agents/runs/${foreignRunId}/resume`, { headers }))
    expect(resumeResponse.status).toBe(409)

    const messageResponse = await appendMessage(new Request(`http://localhost/api/agents/runs/${foreignRunId}/messages`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ role: 'user', content: 'tamper' }) }))
    expect(messageResponse.status).toBe(409)
    expect(await prisma.agentMessage.count({ where: { runId: foreignRunId } })).toBe(0)
  })

  it('refuses browser-side agent launch even when a desktop marker is forged', async () => {
    const response = await createRun(new Request('http://localhost/api/agents/runs', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-scriptmanager-desktop': '1', 'x-scriptmanager-workspace-id': 'foreign-workspace', 'x-scriptmanager-user-id': 'attacker' },
      body: JSON.stringify({ profileId: localProfileId, prompt: 'inspect', cwd: '/tmp' }),
    }))
    expect(response.status).toBe(409)
    expect((await response.json()).desktopHostRequired).toBe(true)
    expect(await prisma.agentRun.count({ where: { profileId: localProfileId } })).toBe(0)
  })

  it('requires authorization when creating a profile', async () => {
    const response = await createProfile(new Request('http://localhost/api/agents/profiles', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-scriptmanager-workspace-id': 'foreign-workspace' },
      body: JSON.stringify({ name: 'Scoped profile', provider: 'codex', accessLevel: 'observe' }),
    }))
    expect(response.status).toBe(201)
    const created = await response.json() as { workspaceId: string }
    expect(created.workspaceId).toBe('default')
  })

  it('rejects a profile that references a provider configuration for another provider', async () => {
    const provider = await prisma.agentProviderConfig.findFirstOrThrow({ where: { provider: 'codex' } })
    const response = await createProfile(new Request('http://localhost/api/agents/profiles', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Mismatched profile', provider: 'claude', providerConfigId: provider.id, accessLevel: 'observe' }),
    }))
    expect(response.status).toBe(400)
    expect(await prisma.agentProfile.count({ where: { name: 'Mismatched profile' } })).toBe(0)
  })

  it('restricts global agent provider configuration to session managers', async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId: 'default', key: 'viewer' } } })
    await prisma.membership.updateMany({ where: { userId: 'local-admin', workspaceId: 'default' }, data: { roleId: viewerRole.id } })

    expect((await listProviders(new Request('http://localhost/api/agents/providers', { headers: { cookie: sessionCookie } }))).status).toBe(403)
  })
})
