import type { ApprovalDecisionKind, ApprovalScope } from './types'

export function isApprovalExpired(expiresAt: Date, now = new Date()) { return expiresAt.getTime() <= now.getTime() }

export function canGrantDecision(decision: ApprovalDecisionKind, protectedAction: boolean) {
  return decision !== 'allow_workspace' || !protectedAction
}

export function grantMatches(
  grant: ApprovalScope & { expiresAt: Date | null },
  request: ApprovalScope,
  now = new Date(),
) {
  if (grant.expiresAt && isApprovalExpired(grant.expiresAt, now)) return false
  return grant.actorId === request.actorId
    && grant.workspaceId === request.workspaceId
    && grant.capability === request.capability
    && grant.policyVersion === request.policyVersion
    && (request.resource === grant.resource || request.resource.startsWith(`${grant.resource}/`))
}
