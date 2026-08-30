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

    const interruptResponse = await interruptRun(new Request(`http://localhost/api/agents/runs/${foreignRunId}/interrupt`, { headers }), { params: Promise.resolve({ id: foreignRunId }) })
    expect(interruptResponse.status).toBe(404)

    const messageResponse = await appendMessage(new Request(`http://localhost/api/agents/runs/${foreignRunId}/messages`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ role: 'user', content: 'tamper' }) }), { params: Promise.resolve({ id: foreignRunId }) })
    expect(messageResponse.status).toBe(404)
    expect(await prisma.agentMessage.count({ where: { runId: foreignRunId } })).toBe(0)
  })

  it('creates runs under the trusted workspace and actor', async () => {
    const response = await createRun(new Request('http://localhost/api/agents/runs', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-scriptmanager-desktop': '1', 'x-scriptmanager-workspace-id': 'foreign-workspace', 'x-scriptmanager-user-id': 'attacker' },
      body: JSON.stringify({ profileId: localProfileId, prompt: 'inspect', cwd: '/tmp' }),
    }))
    expect(response.status).toBe(201)
    const created = await response.json() as { id: string; workspaceId: string; initiatedBy: string }
    expect(created.workspaceId).toBe('default')
    expect(created.initiatedBy).toBe('local-admin')
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
})
