import type { PrismaClient } from '@prisma/client'
import { grantMatches } from '@/lib/approvals/policy'
import { createApprovalService } from '@/lib/approvals/service'
import { evaluateAgentAccess, type AgentAccessLevel } from './accessPolicy'

export interface AgentActionInput {
  actorId: string; workspaceId: string; runId: string; correlationId: string
  accessLevel: AgentAccessLevel; capability: string; operation: string; resource: string
  reason?: string; preview?: unknown
}

export async function authorizeAgentAction(database: PrismaClient, input: AgentActionInput): Promise<{ status: 'allowed' } | { status: 'denied'; reason: string } | { status: 'waiting_approval'; requestId: string }> {
  const policy = evaluateAgentAccess(input.accessLevel, input.capability)
  if (!policy.eligible) return { status: 'denied', reason: `${input.accessLevel} access does not allow ${input.capability}` }
  if (!policy.approvalRequired) return { status: 'allowed' }

  if (!policy.protectedAction) {
    const grants = await database.approvalGrant.findMany({ where: { actorId: input.actorId, workspaceId: input.workspaceId, capability: input.capability, revokedAt: null } })
    const matched = grants.some((grant) => (!grant.runId || grant.runId === input.runId) && grantMatches(grant, { actorId: input.actorId, workspaceId: input.workspaceId, capability: input.capability, resource: input.resource, policyVersion: 1 }))
    if (matched) return { status: 'allowed' }
  }

  const request = await createApprovalService(database).create({ actorType: 'agent', actorId: input.actorId, workspaceId: input.workspaceId, runId: input.runId, capability: input.capability, operation: input.operation, resource: input.resource, risk: policy.protectedAction ? 'critical' : 'medium', reason: input.reason, preview: input.preview, protectedAction: policy.protectedAction, correlationId: input.correlationId, expiresAt: new Date(Date.now() + 15 * 60_000) })
  return { status: 'waiting_approval', requestId: request.id }
}
