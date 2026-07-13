import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { createAgentRepository } from './repository'
import type { AcpEvent, AcpProvider, AcpProviderAdapter, AcpSession } from './types'
import { authorizeAgentAction } from './approvalRouter'
import type { AgentAccessLevel } from './accessPolicy'

export function createAgentService(database: PrismaClient, adapters: Record<AcpProvider, AcpProviderAdapter>) {
  const repository = createAgentRepository(database)
  const sessions = new Map<string, AcpSession>()

  async function handleEvent(runId: string, event: AcpEvent, profile?: { id: string; accessLevel: string; workspaceId: string }, session?: AcpSession) {
    if (event.type === 'message') await repository.appendMessage(runId, event.message)
    else if (event.type === 'artifact') await repository.appendArtifact(runId, event.artifact)
    else if (event.type === 'usage') await repository.updateRun(runId, { usage: event.usage })
    else if (event.type === 'error') await repository.updateRun(runId, { status: event.error.recoverable ? 'interrupted' : 'failed', error: event.error, finishedAt: event.error.recoverable ? undefined : new Date() })
    else if (event.type === 'state') await repository.updateRun(runId, { status: event.state })
    else if (event.type === 'permission_request' && profile && session) {
      const decision = await authorizeAgentAction(database, { actorId: profile.id, workspaceId: profile.workspaceId, runId, correlationId: (await database.agentRun.findUniqueOrThrow({ where: { id: runId } })).correlationId, accessLevel: profile.accessLevel as AgentAccessLevel, capability: event.request.capability, operation: event.request.operation, resource: event.request.resource, reason: event.request.reason, preview: event.request.preview })
      if (decision.status === 'allowed') await session.decidePermission(event.request.id, true)
      else if (decision.status === 'denied') await session.decidePermission(event.request.id, false)
      else {
        await database.permissionGrant.create({ data: { runId, capability: event.request.capability, resource: event.request.resource, decision: 'pending', decidedBy: 'pending', approvalRequestId: decision.requestId } })
        await repository.updateRun(runId, { status: 'waiting_approval' })
      }
    }
  }

  return {
    createProviderConfig: repository.createProviderConfig,
    createProfile: repository.createProfile,
    listRuns: repository.listRuns,
    getRun: repository.getRun,
    async discover() { return Promise.all([adapters.codex.discover(), adapters.claude.discover()]) },
    async launch(input: { profileId: string; prompt: string; cwd: string; desktopHost: boolean; input?: unknown; correlationId?: string }) {
      if (!input.desktopHost) throw new Error('A desktop host is required to launch local agent providers')
      const profile = await database.agentProfile.findUniqueOrThrow({ where: { id: input.profileId } })
      const provider = profile.provider as AcpProvider
      const run = await repository.createRun({ profileId: profile.id, provider, correlationId: input.correlationId ?? randomUUID(), workspaceId: profile.workspaceId, input: input.input ?? { prompt: input.prompt } })
      const session = await adapters[provider].launch({ sessionId: run.id, cwd: input.cwd, profileId: profile.id, model: profile.model ?? undefined })
      sessions.set(run.id, session)
      session.onEvent((event) => handleEvent(run.id, event, profile, session))
      await repository.updateRun(run.id, { status: 'running', providerSessionId: session.id, startedAt: new Date() })
      await repository.appendMessage(run.id, { role: 'user', content: input.prompt })
      await session.input({ role: 'user', content: input.prompt })
      return (await repository.getRun(run.id))!
    },
    async interrupt(runId: string) { const session = sessions.get(runId); if (session) await session.interrupt(); return repository.updateRun(runId, { status: 'interrupted' }) },
    async terminate(runId: string) { const session = sessions.get(runId); if (session) await session.terminate(); sessions.delete(runId); return repository.updateRun(runId, { status: 'terminated', finishedAt: new Date() }) },
    async resume(runId: string, prompt: string) {
      const run = await database.agentRun.findUniqueOrThrow({ where: { id: runId } })
      let session = sessions.get(runId)
      if (!session) { session = await adapters[run.provider as AcpProvider].reconnect(run.providerSessionId ?? run.id); sessions.set(runId, session); session.onEvent((event) => handleEvent(runId, event)) }
      await repository.appendMessage(runId, { role: 'user', content: prompt }); await session.input({ role: 'user', content: prompt }); return repository.updateRun(runId, { status: 'running', finishedAt: null })
    },
  }
}
