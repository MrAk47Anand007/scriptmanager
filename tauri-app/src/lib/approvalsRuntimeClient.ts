import type { ApprovalDecisionKind } from '@/lib/approvals/types'

export async function listApprovalsRuntime(status = 'pending') {
  if (window.scriptManagerDesktop?.runtime?.listApprovals) {
    return window.scriptManagerDesktop.runtime.listApprovals(status)
  }

  throw new Error('Desktop runtime unavailable')
}

export async function decideApprovalRuntime(id: string, decision: ApprovalDecisionKind, note?: string) {
  if (window.scriptManagerDesktop?.runtime?.decideApproval) {
    return window.scriptManagerDesktop.runtime.decideApproval({ id, decision, note })
  }

  throw new Error('Desktop runtime unavailable')
}
