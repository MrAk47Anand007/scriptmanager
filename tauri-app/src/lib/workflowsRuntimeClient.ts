import type { WorkflowDefinition } from '@/lib/workflows/types'

type SaveWorkflowPayload = { id: string; definition: WorkflowDefinition; projectId?: string | null }

export async function listWorkflowsRuntime() {
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
