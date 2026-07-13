export type ApprovalDecisionKind = 'allow_once' | 'allow_run' | 'allow_workspace' | 'reject'
export type ApprovalRisk = 'low' | 'medium' | 'high' | 'critical'

export interface ApprovalScope {
  actorId: string
  workspaceId: string
  capability: string
  resource: string
  policyVersion: number
}
