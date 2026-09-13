import { invokeTauri } from '@/lib/tauriInvoke'

function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

export type MockRouteRuntime = {
  method: string
  path: string
  status: number
  headers: Record<string, string>
  body: string
  delayMs: number
  matchMode: 'exact' | 'prefix'
  enabled: boolean
}

export type MockServerRuntime = {
  id: string
  name: string
  collectionId?: string | null
  port: number
  enabled: boolean
  routes: MockRouteRuntime[]
  createdAt: string
  updatedAt: string
}

export type MockServerStatusRuntime = MockServerRuntime & { running: boolean; port?: number | null }

export type MockRequestRecordRuntime = {
  id: string
  serverId: string
  method: string
  path: string
  headers: Record<string, string>
  body: string
  statusSent: number
  matchedRouteId?: string | null
  createdAt: string
}

export async function listMockServersRuntime(): Promise<Array<MockServerRuntime & { running: boolean; port?: number | null }>> {
  if (isTauri()) return invokeTauri('mock_server_status') as Promise<Array<MockServerRuntime & { running: boolean; port?: number | null }>>
  if (window.scriptManagerDesktop?.listMockServers) {
    return window.scriptManagerDesktop.listMockServers() as Promise<Array<MockServerRuntime & { running: boolean; port?: number | null }>>
  }
  return []
}

export async function saveMockServerRuntime(payload: { id?: string; name: string; port: number; enabled: boolean; routes: MockRouteRuntime[] }): Promise<MockServerRuntime> {
  if (isTauri()) return invokeTauri('save_mock_server', { payload }) as Promise<MockServerRuntime>
  if (window.scriptManagerDesktop?.saveMockServer) {
    return window.scriptManagerDesktop.saveMockServer(payload) as Promise<MockServerRuntime>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function deleteMockServerRuntime(id: string): Promise<boolean> {
  if (isTauri()) return invokeTauri('delete_mock_server', { id })
  if (window.scriptManagerDesktop?.deleteMockServer) return window.scriptManagerDesktop.deleteMockServer(id)
  return false
}

export async function startMockServerRuntime(id: string): Promise<MockServerStatusRuntime> {
  if (isTauri()) return invokeTauri('start_mock_server', { id }) as Promise<MockServerStatusRuntime>
  if (window.scriptManagerDesktop?.startMockServer) return window.scriptManagerDesktop.startMockServer(id) as Promise<MockServerStatusRuntime>
  throw new Error('Desktop runtime unavailable')
}

export async function stopMockServerRuntime(id: string): Promise<MockServerStatusRuntime> {
  if (isTauri()) return invokeTauri('stop_mock_server', { id }) as Promise<MockServerStatusRuntime>
  if (window.scriptManagerDesktop?.stopMockServer) return window.scriptManagerDesktop.stopMockServer(id) as Promise<MockServerStatusRuntime>
  throw new Error('Desktop runtime unavailable')
}

export async function listMockRequestsRuntime(serverId: string): Promise<MockRequestRecordRuntime[]> {
  if (isTauri()) return invokeTauri('list_mock_requests', { serverId }) as Promise<MockRequestRecordRuntime[]>
  if (window.scriptManagerDesktop?.listMockRequests) return window.scriptManagerDesktop.listMockRequests(serverId) as Promise<MockRequestRecordRuntime[]>
  return []
}

export async function clearMockRequestsRuntime(serverId: string): Promise<boolean> {
  if (isTauri()) return invokeTauri('clear_mock_requests', { serverId })
  if (window.scriptManagerDesktop?.clearMockRequests) return window.scriptManagerDesktop.clearMockRequests(serverId)
  return false
}
