import type { WorkflowDefinition } from '@/lib/workflows/types'
import { invokeTauri } from '@/lib/tauriInvoke'
import { isDesktopRenderer } from '@/lib/runtime/desktopMode'

type SaveWorkflowPayload = { id: string; definition: WorkflowDefinition; projectId?: string | null }

function isTauri(): boolean {
  return isDesktopRenderer()
}

export async function listWorkflowsRuntime() {
  if (isTauri()) {
    return invokeTauri('list_workflows')
  }
  if (window.scriptManagerDesktop?.runtime?.listWorkflows) {
    return window.scriptManagerDesktop.runtime.listWorkflows()
  }
  const response = await fetch('/api/workflows')
  if (!response.ok) {
    throw new Error('Unable to load workflows')
  }
  return response.json()
}

export async function createWorkflowRuntime(payload: { name: string; description?: string; definition: WorkflowDefinition; projectId?: string | null }) {
  if (isTauri()) {
    return invokeTauri('create_workflow', { payload })
  }
  if (window.scriptManagerDesktop?.runtime?.createWorkflow) {
    return window.scriptManagerDesktop.runtime.createWorkflow(payload)
  }
  const response = await fetch('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Workflow create failed')
  }
  return response.json()
}

export async function saveWorkflowRuntime(payload: SaveWorkflowPayload) {
  if (isTauri()) {
    return invokeTauri('save_workflow', { payload })
  }
  if (window.scriptManagerDesktop?.runtime?.saveWorkflow) {
    return window.scriptManagerDesktop.runtime.saveWorkflow(payload)
  }
  const response = await fetch(`/api/workflows/${payload.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ definition: payload.definition, projectId: payload.projectId ?? null }),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error)
  }
  return response.json()
}

export async function publishWorkflowRuntime(id: string) {
  if (isTauri()) {
    return invokeTauri('publish_workflow', { id })
  }
  if (window.scriptManagerDesktop?.runtime?.publishWorkflow) {
    return window.scriptManagerDesktop.runtime.publishWorkflow(id)
  }
  const response = await fetch(`/api/workflows/${id}/publish`, { method: 'POST' })
  if (!response.ok) {
    throw new Error((await response.json()).error)
  }
  return response.json()
}

export async function runWorkflowRuntime(id: string) {
  if (isTauri()) {
    return invokeTauri('run_workflow', { payload: { id, input: {} } })
  }
  if (window.scriptManagerDesktop?.runtime?.runWorkflow) {
    return window.scriptManagerDesktop.runtime.runWorkflow({ id, input: {} })
  }
  const response = await fetch(`/api/workflows/${id}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: {} }),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error)
  }
  return response.json()
}

const parseJson = (value: unknown) => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function normalizeWorkflowRunDetail(raw: Record<string, any>) {
  return {
    id: raw.id,
    status: raw.status,
    createdAt: String(raw.createdAt),
    startedAt: raw.startedAt ? String(raw.startedAt) : null,
    finishedAt: raw.finishedAt ? String(raw.finishedAt) : null,
    nodeRuns: (raw.nodeRuns ?? []).map((node: Record<string, any>) => ({
      nodeId: node.nodeId,
      status: node.status,
      attempt: node.attempt ?? 1,
      input: parseJson(node.inputJson ?? node.input),
      output: parseJson(node.outputJson ?? node.output),
      error: parseJson(node.errorJson ?? node.error),
      startedAt: node.startedAt ? String(node.startedAt) : null,
      finishedAt: node.finishedAt ? String(node.finishedAt) : null,
    })),
  }
}

export async function fetchWorkflowRunsRuntime(workflowId: string) {
  if (isTauri()) {
    return invokeTauri('list_workflow_runs', { workflowId })
  }
  if (window.scriptManagerDesktop?.runtime?.listWorkflowRuns) {
    return window.scriptManagerDesktop.runtime.listWorkflowRuns(workflowId)
  }
  const response = await fetch(`/api/workflows/${workflowId}/runs`)
  if (!response.ok) {
    throw new Error('Unable to load workflow runs')
  }
  return response.json()
}

export async function fetchWorkflowRunRuntime(runId: string) {
  if (isTauri()) {
    const response = await invokeTauri<Record<string, any>>('read_workflow_run', { runId })
    return normalizeWorkflowRunDetail(response)
  }
  if (window.scriptManagerDesktop?.runtime?.readWorkflowRun) {
    const response = await window.scriptManagerDesktop.runtime.readWorkflowRun(runId)
    return normalizeWorkflowRunDetail(response as Record<string, any>)
  }
  const response = await fetch(`/api/workflow-runs/${runId}`)
  if (!response.ok) {
    throw new Error('Unable to load workflow run')
  }
  return normalizeWorkflowRunDetail(await response.json())
}

export async function retryWorkflowNodeRuntime(payload: { runId: string; nodeId: string }) {
  if (isTauri()) {
    const response = await invokeTauri<Record<string, any>>('retry_workflow_node', { payload })
    return normalizeWorkflowRunDetail(response)
  }
  if (window.scriptManagerDesktop?.runtime?.retryWorkflowNode) {
    const response = await window.scriptManagerDesktop.runtime.retryWorkflowNode(payload)
    return normalizeWorkflowRunDetail(response as Record<string, any>)
  }
  const response = await fetch(`/api/workflow-runs/${payload.runId}/retry-node`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId: payload.nodeId }),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Retry failed')
  }
  return normalizeWorkflowRunDetail(await response.json())
}

export async function cancelWorkflowRunRuntime(runId: string) {
  if (isTauri()) {
    const response = await invokeTauri<Record<string, any>>('cancel_workflow_run', { runId })
    return normalizeWorkflowRunDetail(response)
  }
  if (window.scriptManagerDesktop?.runtime?.cancelWorkflowRun) {
    const response = await window.scriptManagerDesktop.runtime.cancelWorkflowRun(runId)
    return normalizeWorkflowRunDetail(response as Record<string, any>)
  }
  const response = await fetch(`/api/workflow-runs/${runId}/cancel`, { method: 'POST' })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Cancel failed')
  }
  return normalizeWorkflowRunDetail(await response.json())
}

export async function resolveWorkflowApprovalRuntime(payload: { runId: string; nodeId: string; approved: boolean; decidedBy?: string }) {
  if (isTauri()) {
    const response = await invokeTauri<Record<string, any>>('resolve_workflow_approval', { payload })
    return normalizeWorkflowRunDetail(response)
  }
  if (window.scriptManagerDesktop?.runtime?.resolveWorkflowApproval) {
    const response = await window.scriptManagerDesktop.runtime.resolveWorkflowApproval(payload)
    return normalizeWorkflowRunDetail(response as Record<string, any>)
  }
  throw new Error('Desktop runtime unavailable')
}

export type WorkflowTriggerRuntime = {
  id: string
  workflowId: string
  triggerType: string
  enabled: boolean
  config: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export async function listWorkflowTriggersRuntime(workflowId: string): Promise<WorkflowTriggerRuntime[]> {
  if (isTauri()) {
    return invokeTauri<WorkflowTriggerRuntime[]>('list_workflow_triggers', { workflowId })
  }
  if (window.scriptManagerDesktop?.runtime?.listWorkflowTriggers) {
    return window.scriptManagerDesktop.runtime.listWorkflowTriggers(workflowId) as Promise<WorkflowTriggerRuntime[]>
  }
  return []
}

export async function saveWorkflowTriggerRuntime(payload: { workflowId: string; type?: string; cron?: string; enabled: boolean }): Promise<WorkflowTriggerRuntime> {
  if (isTauri()) {
    return invokeTauri<WorkflowTriggerRuntime>('save_workflow_trigger', { payload })
  }
  if (window.scriptManagerDesktop?.runtime?.saveWorkflowTrigger) {
    return window.scriptManagerDesktop.runtime.saveWorkflowTrigger(payload) as Promise<WorkflowTriggerRuntime>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function deleteWorkflowTriggerRuntime(triggerId: string): Promise<boolean> {
  if (isTauri()) {
    return invokeTauri<boolean>('delete_workflow_trigger', { triggerId })
  }
  if (window.scriptManagerDesktop?.runtime?.deleteWorkflowTrigger) {
    return window.scriptManagerDesktop.runtime.deleteWorkflowTrigger(triggerId)
  }
  return false
}

export type WebhookInfoRuntime = {
  listenerRunning: boolean | null
  port: number
  token: string
  secret: string
}

export async function rotateWorkflowWebhookRuntime(workflowId: string): Promise<WebhookInfoRuntime> {
  if (isTauri()) {
    const result = await invokeTauri<{ token: string; secret: string }>('rotate_workflow_webhook', { workflowId })
    return { listenerRunning: null, port: 8787, ...result }
  }
  if (window.scriptManagerDesktop?.runtime?.rotateWorkflowWebhook) {
    return window.scriptManagerDesktop.runtime.rotateWorkflowWebhook(workflowId) as Promise<WebhookInfoRuntime>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function webhookListenerStatusRuntime(): Promise<number | null> {
  if (isTauri()) return invokeTauri<number | null>('webhook_listener_status')
  if (window.scriptManagerDesktop?.runtime?.webhookListenerStatus) {
    return window.scriptManagerDesktop.runtime.webhookListenerStatus()
  }
  return null
}

export async function draftWorkflowRuntime(payload: { prompt: string; profileId?: string | null }): Promise<{ definition: unknown; issues: Array<{ code: string; message: string }>; provider: string; profileId: string }> {
  if (isTauri()) {
    return invokeTauri('draft_workflow_from_prompt', { payload })
  }
  if (window.scriptManagerDesktop?.runtime?.draftWorkflow) {
    return window.scriptManagerDesktop.runtime.draftWorkflow(payload)
  }
  throw new Error('Desktop runtime unavailable')
}

export async function diagnoseNodeRuntime(payload: { runId: string; nodeId: string; profileId?: string | null }): Promise<{ diagnosis: string; provider: string }> {
  if (isTauri()) {
    return invokeTauri('diagnose_node_failure', { payload })
  }
  if (window.scriptManagerDesktop?.runtime?.diagnoseNode) {
    return window.scriptManagerDesktop.runtime.diagnoseNode(payload)
  }
  throw new Error('Desktop runtime unavailable')
}
