import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { createAgentRepository } from './repository'
import type { AcpEvent, AcpProvider, AcpProviderAdapter, AcpSession } from './types'
import { authorizeAgentAction } from './approvalRouter'
import type { AgentAccessLevel } from './accessPolicy'

const AGENT_POLL_INTERVAL_MS = 100

export type AgentWorkflowService = {
  launch(input: { profileId: string; prompt: string; cwd: string; desktopHost: boolean; input?: unknown; correlationId?: string; workspaceId?: string }): Promise<{ id: string }>
  waitForCompletion(runId: string, signal?: AbortSignal): Promise<{
    id: string
    provider: string
    status: string
    errorJson?: string | null
    usageJson?: string | null
    messages: Array<{ role: string; content: string }>
    artifacts: Array<{ kind: string; name: string; content?: string | null; path?: string | null }>
  }>
}

export function createAgentService(database: PrismaClient, adapters: Record<AcpProvider, AcpProviderAdapter>) {
  const repository = createAgentRepository(database)
  const sessions = new Map<string, AcpSession>()
  const pendingPermissions = new Map<string, Map<string, string>>()

  async function handleEvent(runId: string, event: AcpEvent, profile?: { id: string; accessLevel: string; workspaceId: string }, session?: AcpSession) {
    if (event.type === 'message') await repository.appendMessage(runId, event.message)
    else if (event.type === 'artifact') await repository.appendArtifact(runId, event.artifact)
    else if (event.type === 'usage') await repository.updateRun(runId, { usage: event.usage })
    else if (event.type === 'error' && event.error.code !== 'provider_stderr') await repository.updateRun(runId, { status: event.error.recoverable ? 'interrupted' : 'failed', error: event.error, finishedAt: event.error.recoverable ? undefined : new Date() })
    else if (event.type === 'state') await repository.updateRun(runId, { status: event.state, finishedAt: ['succeeded', 'terminated', 'error', 'interrupted'].includes(event.state) ? new Date() : undefined })
    else if (event.type === 'permission_request' && profile && session) {
      const decision = await authorizeAgentAction(database, { actorId: profile.id, workspaceId: profile.workspaceId, runId, correlationId: (await database.agentRun.findUniqueOrThrow({ where: { id: runId } })).correlationId, accessLevel: profile.accessLevel as AgentAccessLevel, capability: event.request.capability, operation: event.request.operation, resource: event.request.resource, reason: event.request.reason, preview: event.request.preview })
      if (decision.status === 'allowed') await session.decidePermission(event.request.id, true)
      else if (decision.status === 'denied') await session.decidePermission(event.request.id, false)
      else {
        await database.permissionGrant.create({ data: { runId, capability: event.request.capability, resource: event.request.resource, decision: 'pending', decidedBy: 'pending', approvalRequestId: decision.requestId } })
        const requests = pendingPermissions.get(runId) ?? new Map<string, string>()
        requests.set(decision.requestId, event.request.id)
        pendingPermissions.set(runId, requests)
        await repository.updateRun(runId, { status: 'waiting_approval' })
      }
    }
  }

  function subscribeToEvents(runId: string, session: AcpSession, profile: { id: string; accessLevel: string; workspaceId: string }, replay = false) {
    session.onEvent((event) => handleEvent(runId, event, profile, session).catch((error) =>
      repository.updateRun(runId, {
          status: 'failed',
          error: { message: error instanceof Error ? error.message : 'Agent event handling failed' },
          finishedAt: new Date(),
        }).catch(() => {})
    ), replay ? { replay: true } : undefined)
  }

  async function settlePendingPermissions(runId: string, session: AcpSession) {
    const grants = await database.permissionGrant.findMany({ where: { runId, decision: 'pending' } })
    for (const grant of grants) {
      if (!grant.approvalRequestId) continue
      const request = await database.approvalRequest.findUnique({ where: { id: grant.approvalRequestId }, include: { decisions: { orderBy: { createdAt: 'desc' }, take: 1 } } })
      if (!request || request.status === 'pending') continue
      const allowed = request.status === 'approved'
      const providerRequestId = pendingPermissions.get(runId)?.get(grant.approvalRequestId)
      if (!providerRequestId) {
        await repository.updateRun(runId, { status: 'failed', error: { message: 'Agent permission request can no longer be resumed' }, finishedAt: new Date() })
        continue
      }
      await session.decidePermission(providerRequestId, allowed)
      await database.permissionGrant.updateMany({ where: { id: grant.id, decision: 'pending' }, data: { decision: allowed ? 'approved' : 'rejected', decidedBy: request.decisions[0]?.decidedBy ?? 'system' } })
      pendingPermissions.get(runId)?.delete(grant.approvalRequestId)
      if (allowed) await repository.updateRun(runId, { status: 'running' })
      else await repository.updateRun(runId, { status: 'failed', error: { message: 'Agent permission request was rejected' }, finishedAt: new Date() })
    }
  }

  async function waitForCompletion(runId: string, signal?: AbortSignal) {
    while (true) {
      if (signal?.aborted) {
        const session = sessions.get(runId)
        if (session) await session.interrupt().catch(() => {})
        await repository.updateRun(runId, { status: 'interrupted', finishedAt: new Date() }).catch(() => {})
        throw new Error('Workflow node cancelled')
      }
      const run = await repository.getRun(runId)
      if (!run) throw new Error('Agent run not found')
      if (['failed', 'interrupted', 'terminated', 'succeeded'].includes(run.status)) return run
      const session = sessions.get(runId)
      if (!session) throw new Error('Agent session is no longer available')
      if (run.status === 'waiting_approval') await settlePendingPermissions(runId, session)
      await new Promise((resolve) => setTimeout(resolve, AGENT_POLL_INTERVAL_MS))
    }
  }

  async function getRunInWorkspace(runId: string, workspaceId: string) {
    const run = await database.agentRun.findFirst({ where: { id: runId, workspaceId } })
    if (!run) throw new Error('Agent run not found')
    return run
  }

  return {
    createProviderConfig: repository.createProviderConfig,
    createProfile: repository.createProfile,
    listRuns: repository.listRuns,
    getRun: repository.getRun,
    async discover() { return Promise.all([adapters.codex.discover(), adapters.claude.discover()]) },
    async launch(input: { profileId: string; prompt: string; cwd: string; desktopHost: boolean; input?: unknown; correlationId?: string; workspaceId?: string }) {
      if (!input.desktopHost) throw new Error('A desktop host is required to launch local agent providers')
      const profile = await database.agentProfile.findFirst({ where: { id: input.profileId, ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}) } })
      if (!profile) throw new Error('Agent profile not found')
      const provider = profile.provider as AcpProvider
      const run = await repository.createRun({ profileId: profile.id, provider, correlationId: input.correlationId ?? randomUUID(), workspaceId: profile.workspaceId, input: input.input ?? { prompt: input.prompt } })
      let session: AcpSession | undefined
      try {
        session = await adapters[provider].launch({ sessionId: run.id, cwd: input.cwd, profileId: profile.id, model: profile.model ?? undefined })
        sessions.set(run.id, session)
        subscribeToEvents(run.id, session, profile, true)
        await repository.updateRun(run.id, { status: 'running', providerSessionId: session.id, startedAt: new Date() })
        await repository.appendMessage(run.id, { role: 'user', content: input.prompt })
        await session.input({ role: 'user', content: input.prompt })
        return (await repository.getRun(run.id))!
      } catch (error) {
        sessions.delete(run.id)
        await session?.terminate().catch(() => {})
        await repository.updateRun(run.id, {
          status: 'failed',
          error: { message: error instanceof Error ? error.message : 'Agent launch failed' },
          finishedAt: new Date(),
        }).catch(() => {})
        throw error
      }
    },
    async interrupt(runId: string, workspaceId: string) {
      await getRunInWorkspace(runId, workspaceId)
      const session = sessions.get(runId)
      if (session) await session.interrupt()
      return repository.updateRun(runId, { status: 'interrupted' })
    },
    async terminate(runId: string, workspaceId: string) {
      await getRunInWorkspace(runId, workspaceId)
      const session = sessions.get(runId)
      if (session) await session.terminate()
      sessions.delete(runId)
      return repository.updateRun(runId, { status: 'terminated', finishedAt: new Date() })
    },
    async resume(runId: string, prompt: string, workspaceId: string) {
      const run = await getRunInWorkspace(runId, workspaceId)
      let session = sessions.get(runId)
      if (!session) {
        const profile = await database.agentProfile.findFirst({ where: { id: run.profileId, workspaceId: run.workspaceId } })
        if (!profile) throw new Error('Agent profile not found')
        session = await adapters[run.provider as AcpProvider].reconnect(run.providerSessionId ?? run.id)
        sessions.set(runId, session)
        subscribeToEvents(runId, session, profile)
      }
      await repository.appendMessage(runId, { role: 'user', content: prompt }); await session.input({ role: 'user', content: prompt }); return repository.updateRun(runId, { status: 'running', finishedAt: null })
    },
    waitForCompletion,
  }
}
