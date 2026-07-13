import type { PrismaClient } from '@prisma/client'
import { redactAgentValue } from './redaction'
import type { AcpArtifact, AcpMessage, AcpProvider, AcpUsage } from './types'

export function createAgentRepository(database: PrismaClient) {
  return {
    createProviderConfig(input: { provider: AcpProvider; name: string; executable: string; credentialRef?: string }) { return database.agentProviderConfig.create({ data: input }) },
    createProfile(input: { name: string; provider: AcpProvider; providerConfigId?: string; accessLevel: string; workspaceId: string; model?: string; systemPrompt?: string }) { return database.agentProfile.create({ data: input }) },
    createRun(input: { profileId: string; provider: AcpProvider; correlationId: string; workspaceId: string; input: unknown; secrets?: string[] }) {
      return database.agentRun.create({ data: { profileId: input.profileId, provider: input.provider, correlationId: input.correlationId, workspaceId: input.workspaceId, inputJson: JSON.stringify(redactAgentValue(input.input, input.secrets)), status: 'queued' } })
    },
    appendMessage(runId: string, message: AcpMessage, secrets: string[] = []) { const safe = redactAgentValue(message, secrets); return database.agentMessage.create({ data: { runId, role: safe.role, content: safe.content, metadataJson: JSON.stringify({ id: safe.id, createdAt: safe.createdAt }) } }) },
    appendArtifact(runId: string, artifact: AcpArtifact, secrets: string[] = []) { const safe = redactAgentValue(artifact, secrets); return database.agentArtifact.create({ data: { runId, kind: safe.kind, name: safe.name, content: safe.content, path: safe.path, metadataJson: JSON.stringify(safe.metadata ?? {}) } }) },
    updateRun(id: string, input: { status?: string; output?: unknown; usage?: AcpUsage; error?: unknown; providerSessionId?: string; startedAt?: Date | null; finishedAt?: Date | null }, secrets: string[] = []) {
      return database.agentRun.update({ where: { id }, data: { status: input.status, outputJson: input.output === undefined ? undefined : JSON.stringify(redactAgentValue(input.output, secrets)), usageJson: input.usage === undefined ? undefined : JSON.stringify(input.usage), errorJson: input.error === undefined ? undefined : JSON.stringify(redactAgentValue(input.error, secrets)), providerSessionId: input.providerSessionId, startedAt: input.startedAt, finishedAt: input.finishedAt } })
    },
    getRun(id: string) { return database.agentRun.findUnique({ where: { id }, include: { profile: true, messages: { orderBy: { createdAt: 'asc' } }, artifacts: { orderBy: { createdAt: 'asc' } }, permissionGrants: true } }) },
    listRuns(workspaceId = 'default') { return database.agentRun.findMany({ where: { workspaceId }, include: { profile: true }, orderBy: { createdAt: 'desc' } }) },
  }
}
