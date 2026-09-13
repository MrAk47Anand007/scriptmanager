import { invokeTauri } from '@/lib/tauriInvoke'

function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

export type FleetTargetRuntime = {
  id: string
  profileId: string
  profileName: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  exitCode?: number | null
  output?: string | null
  startedAt?: string | null
  finishedAt?: string | null
}

export type FleetRunRuntime = {
  id: string
  command: string
  note?: string | null
  status: 'pending_approval' | 'running' | 'done' | 'partial' | 'failed'
  totalTargets: number
  succeededTargets: number
  failedTargets: number
  createdAt: string
  startedAt?: string | null
  finishedAt?: string | null
  targets: FleetTargetRuntime[]
}

export async function startFleetRunRuntime(payload: { profileIds: string[]; command: string; note?: string }): Promise<FleetRunRuntime> {
  if (isTauri()) return invokeTauri('start_fleet_run', { payload })
  if (window.scriptManagerDesktop?.runtime?.startFleetRun) {
    return window.scriptManagerDesktop.runtime.startFleetRun(payload) as Promise<FleetRunRuntime>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function approveFleetRunRuntime(fleetRunId: string): Promise<FleetRunRuntime> {
  if (isTauri()) return invokeTauri('approve_fleet_run', { fleetRunId })
  if (window.scriptManagerDesktop?.runtime?.approveFleetRun) {
    return window.scriptManagerDesktop.runtime.approveFleetRun(fleetRunId) as Promise<FleetRunRuntime>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function listFleetRunsRuntime(limit = 20): Promise<FleetRunRuntime[]> {
  if (isTauri()) return invokeTauri('list_fleet_runs', { payload: { limit } })
  if (window.scriptManagerDesktop?.runtime?.listFleetRuns) {
    return window.scriptManagerDesktop.runtime.listFleetRuns(limit) as Promise<FleetRunRuntime[]>
  }
  return []
}
