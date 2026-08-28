import type { ApprovalDecisionKind } from '@/lib/approvals/types'

export async function listApprovalsRuntime(status = 'pending') {
  if (window.scriptManagerDesktop?.runtime?.listApprovals) {
    return window.scriptManagerDesktop.runtime.listApprovals(status)
  }

  const response = await fetch(`/api/approvals?status=${encodeURIComponent(status)}`)
  if (!response.ok) {
    throw new Error('Failed to load approvals')
  }
  return response.json()
}

export async function decideApprovalRuntime(id: string, decision: ApprovalDecisionKind, note?: string) {
  if (window.scriptManagerDesktop?.runtime?.decideApproval) {
    return window.scriptManagerDesktop.runtime.decideApproval({ id, decision, note })
  }

  const response = await fetch(`/api/approvals/${id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision, note }),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Failed to decide approval')
  }
  return response.json()
}
