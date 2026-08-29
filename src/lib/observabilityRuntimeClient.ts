import axios from 'axios'
import type { ExecutionDashboard, ExecutionFilters, ExecutionKind, ExecutionRunSummary, ExecutionStatus } from './observability/types'

export type ObservabilityRuntimeFilters = Pick<ExecutionFilters, 'kind' | 'status'>

function queryString(filters?: ObservabilityRuntimeFilters) {
  const query = new URLSearchParams()
  if (filters?.kind) query.set('kind', filters.kind)
  if (filters?.status) query.set('status', filters.status)
  return query.toString()
}

function apiError(response: { data?: unknown }) {
  const data = response.data
  return data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
    ? (data as { error: string }).error
    : 'Observability request failed'
}

export async function getObservabilityDashboardRuntime(filters?: ObservabilityRuntimeFilters): Promise<ExecutionDashboard> {
  if (window.scriptManagerDesktop?.runtime?.getObservabilityDashboard) {
    return window.scriptManagerDesktop.runtime.getObservabilityDashboard(filters) as Promise<ExecutionDashboard>
  }
  const response = await axios.get(`/api/observability/dashboard?${queryString(filters)}`)
  return response.data as ExecutionDashboard
}

export async function getObservabilityRunDetailRuntime(kind: ExecutionKind, id: string): Promise<Record<string, unknown> | null> {
  if (window.scriptManagerDesktop?.runtime?.getObservabilityRunDetail) {
    return window.scriptManagerDesktop.runtime.getObservabilityRunDetail({ kind, id }) as Promise<Record<string, unknown> | null>
  }
  const response = await axios.get(`/api/observability/runs/${kind}/${encodeURIComponent(id)}`)
  return response.data as Record<string, unknown>
}

export async function cancelObservabilityRunRuntime(kind: ExecutionKind, id: string) {
  if (kind !== 'workflow') throw new Error('Cancellation is not supported for this execution type')
  if (window.scriptManagerDesktop?.runtime?.cancelObservabilityRun) {
    return window.scriptManagerDesktop.runtime.cancelObservabilityRun(id)
  }
  const response = await axios.post(`/api/observability/runs/${kind}/${encodeURIComponent(id)}/cancel`, {})
  if (response.status >= 400) throw new Error(apiError(response))
  return response.data
}

export async function retryObservabilityRunRuntime(kind: ExecutionKind, id: string, nodeId?: string) {
  if (kind !== 'workflow') throw new Error('Retry is not supported for this execution type')
  if (window.scriptManagerDesktop?.runtime?.retryObservabilityRun) {
    return window.scriptManagerDesktop.runtime.retryObservabilityRun({ id, nodeId })
  }
  const response = await axios.post(`/api/observability/runs/${kind}/${encodeURIComponent(id)}/retry`, nodeId ? { nodeId } : {})
  if (response.status >= 400) throw new Error(apiError(response))
  return response.data
}

export async function readObservabilityLogRuntime(kind: ExecutionKind, id: string): Promise<string> {
  if (window.scriptManagerDesktop?.runtime?.readObservabilityLog) {
    return window.scriptManagerDesktop.runtime.readObservabilityLog({ kind, id })
  }
  const response = await axios.get(`/api/observability/runs/${kind}/${encodeURIComponent(id)}/log`, { responseType: 'text' })
  return response.data as string
}

export type { ExecutionKind, ExecutionStatus, ExecutionRunSummary }
