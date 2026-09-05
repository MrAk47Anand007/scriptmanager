import type { ExecutionDashboard, ExecutionFilters, ExecutionKind, ExecutionRunSummary, ExecutionStatus } from './observability/types'

export type ObservabilityRuntimeFilters = Pick<ExecutionFilters, 'kind' | 'status'>

export async function getObservabilityDashboardRuntime(filters?: ObservabilityRuntimeFilters): Promise<ExecutionDashboard> {
  if (!window.scriptManagerDesktop?.runtime?.getObservabilityDashboard) {
    throw new Error('Desktop runtime unavailable')
  }
  return window.scriptManagerDesktop.runtime.getObservabilityDashboard(filters) as Promise<ExecutionDashboard>
}

export async function getObservabilityRunDetailRuntime(kind: ExecutionKind, id: string): Promise<Record<string, unknown> | null> {
  if (!window.scriptManagerDesktop?.runtime?.getObservabilityRunDetail) {
    throw new Error('Desktop runtime unavailable')
  }
  return window.scriptManagerDesktop.runtime.getObservabilityRunDetail({ kind, id }) as Promise<Record<string, unknown> | null>
}

export async function cancelObservabilityRunRuntime(kind: ExecutionKind, id: string) {
  if (kind !== 'workflow') throw new Error('Cancellation is not supported for this execution type')
  if (!window.scriptManagerDesktop?.runtime?.cancelObservabilityRun) {
    throw new Error('Desktop runtime unavailable')
  }
  return window.scriptManagerDesktop.runtime.cancelObservabilityRun(id)
}

export async function retryObservabilityRunRuntime(kind: ExecutionKind, id: string, nodeId?: string) {
  if (kind !== 'workflow') throw new Error('Retry is not supported for this execution type')
  if (!window.scriptManagerDesktop?.runtime?.retryObservabilityRun) {
    throw new Error('Desktop runtime unavailable')
  }
  return window.scriptManagerDesktop.runtime.retryObservabilityRun({ id, nodeId })
}

export async function readObservabilityLogRuntime(kind: ExecutionKind, id: string): Promise<string> {
  if (!window.scriptManagerDesktop?.runtime?.readObservabilityLog) {
    throw new Error('Desktop runtime unavailable')
  }
  return window.scriptManagerDesktop.runtime.readObservabilityLog({ kind, id }) as Promise<string>
}

export type { ExecutionKind, ExecutionStatus, ExecutionRunSummary }
