import type { PrismaClient } from '@prisma/client'
import { createExecutionEvent } from '@/lib/execution/events'
import { createExecutionEventRepository } from '@/lib/execution/eventRepository'
import type { TrustedActorContext } from '@/lib/runtime/trustedContext'
import { canGrantDecision, isApprovalExpired } from './policy'
import type { ApprovalDecisionKind, ApprovalRisk } from './types'

export interface CreateApprovalInput {
  actorType: string; actorId: string; actorName?: string; workspaceId: string
  runId?: string; nodeId?: string; capability: string; operation: string; resource: string
  risk: ApprovalRisk; reason?: string; preview?: unknown; protectedAction?: boolean
  policyVersion?: number; correlationId: string; expiresAt: Date
}

export interface ApprovalDecisionInput {
  requestId: string
  decision: ApprovalDecisionKind
  actor: TrustedActorContext
  note?: string
  now?: Date
}

export function createApprovalService(database: PrismaClient) {
  const events = createExecutionEventRepository(database)
  return {
    list(status = 'pending') {
      return database.approvalRequest.findMany({ where: status === 'all' ? {} : { status }, include: { decisions: true }, orderBy: { createdAt: 'desc' } })
    },
    get(id: string) { return database.approvalRequest.findUnique({ where: { id }, include: { decisions: true } }) },
    async create(input: CreateApprovalInput) {
      const { preview, ...fields } = input
      const request = await database.approvalRequest.create({ data: {
        ...fields, reason: input.reason ?? '', previewJson: JSON.stringify(preview ?? {}),
        protectedAction: input.protectedAction ?? false, policyVersion: input.policyVersion ?? 1,
      } })
      await events.append(createExecutionEvent({ type: 'approval.requested', executionKind: input.runId ? 'workflow' : 'agent', correlationId: input.correlationId, actor: { type: input.actorType as 'user', id: input.actorId, name: input.actorName }, target: { type: input.runId ? 'workflow' : 'agent_run', id: input.runId ?? request.id }, data: { requestId: request.id, capability: input.capability, resource: input.resource, risk: input.risk } }))
      return request
    },
    async expire(now = new Date()) {
      return database.approvalRequest.updateMany({ where: { status: 'pending', expiresAt: { lte: now } }, data: { status: 'expired', decidedAt: now } })
    },
    async decide(inputOrId: ApprovalDecisionInput | string, decisionArg?: ApprovalDecisionKind, decidedByArg?: string, noteArg = '', nowArg = new Date()) {
      const requestId = typeof inputOrId === 'string' ? inputOrId : inputOrId.requestId
      const decision = typeof inputOrId === 'string' ? decisionArg! : inputOrId.decision
      const decidedBy = typeof inputOrId === 'string' ? decidedByArg! : inputOrId.actor.actorId
      const actorWorkspaceId = typeof inputOrId === 'string' ? null : inputOrId.actor.workspaceId
      const note = typeof inputOrId === 'string' ? noteArg : (inputOrId.note ?? '')
      const now = typeof inputOrId === 'string' ? nowArg : (inputOrId.now ?? new Date())
      const request = await database.approvalRequest.findUniqueOrThrow({ where: { id: requestId } })
      if (actorWorkspaceId && request.workspaceId !== actorWorkspaceId) throw new Error('Approval workspace does not match')
      if (request.status !== 'pending') throw new Error(`Approval is ${request.status}`)
      if (isApprovalExpired(request.expiresAt, now)) {
        await database.approvalRequest.update({ where: { id: requestId }, data: { status: 'expired', decidedAt: now } })
        throw new Error('Approval has expired')
      }
      if (!canGrantDecision(decision, request.protectedAction)) throw new Error('Protected actions cannot receive workspace grants')
      const allowed = decision !== 'reject'
      await database.$transaction(async (tx) => {
        await tx.approvalDecision.create({ data: { requestId, decision, decidedBy, note } })
        await tx.approvalRequest.update({ where: { id: requestId }, data: { status: allowed ? 'approved' : 'rejected', decidedAt: now } })
        if (decision === 'allow_run' || decision === 'allow_workspace') await tx.approvalGrant.create({ data: {
          actorId: request.actorId, workspaceId: request.workspaceId, runId: decision === 'allow_run' ? request.runId : null,
          capability: request.capability, resource: request.resource, policyVersion: request.policyVersion, createdBy: decidedBy,
        } })
        if (request.runId && request.nodeId) {
          const node = await tx.workflowNodeRun.findUniqueOrThrow({ where: { runId_nodeId: { runId: request.runId, nodeId: request.nodeId } } })
          if (node.status !== 'waiting_approval') throw new Error(`Workflow node is ${node.status}`)
          await tx.workflowNodeRun.update({ where: { id: node.id }, data: { status: allowed ? 'succeeded' : 'failed', outputJson: JSON.stringify({ approved: allowed, decision, actorId: decidedBy }), errorJson: allowed ? null : JSON.stringify({ message: 'Approval rejected' }), finishedAt: now } })
          await tx.workflowRun.update({ where: { id: request.runId }, data: allowed ? { status: 'queued', workerId: null, claimedAt: null, finishedAt: null } : { status: 'failed', errorJson: JSON.stringify({ message: 'Approval rejected' }), finishedAt: now } })
        }
      })
      await events.append(createExecutionEvent({ type: 'approval.decided', executionKind: request.runId ? 'workflow' : 'agent', correlationId: request.correlationId, actor: { type: 'user', id: decidedBy }, target: { type: request.runId ? 'workflow' : 'agent_run', id: request.runId ?? request.id }, data: { requestId, decision } }))
      return this.get(requestId)
    },
  }
}
