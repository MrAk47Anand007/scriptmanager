import axios from 'axios'
import { invokeTauri } from '@/lib/tauriInvoke'
import { isDesktopRenderer } from '@/lib/runtime/desktopMode'

export function hasDesktopApiRuntime(): boolean {
  return Boolean(window.scriptManagerDesktop?.runtime?.listApiCollections)
}

function isTauri(): boolean {
  return isDesktopRenderer()
}

export async function listApiCollectionsRuntime() {
  if (isTauri()) {
    return invokeTauri('list_api_collections')
  }
  if (window.scriptManagerDesktop?.runtime?.listApiCollections) {
    return window.scriptManagerDesktop.runtime.listApiCollections()
  }
  const response = await axios.get('/api/api-collections')
  return response.data
}

export async function saveApiCollectionRuntime(payload: unknown) {
  if (isTauri()) {
    return invokeTauri('save_api_collection', { payload: payload as Record<string, unknown> })
  }
  if (window.scriptManagerDesktop?.runtime?.saveApiCollection) {
    return window.scriptManagerDesktop.runtime.saveApiCollection(payload)
  }
  const body = payload as Record<string, unknown>
  const response = body.id
    ? await axios.put(`/api/api-collections/${body.id}`, body)
    : await axios.post('/api/api-collections', body)
  return response.data
}

export async function deleteApiCollectionRuntime(id: string) {
  if (isTauri()) {
    return invokeTauri('delete_api_collection', { id })
  }
  if (window.scriptManagerDesktop?.runtime?.deleteApiCollection) {
    return window.scriptManagerDesktop.runtime.deleteApiCollection(id)
  }
  await axios.delete(`/api/api-collections/${id}`)
  return id
}

export async function listApiRequestsRuntime(collectionId?: string | null) {
  if (isTauri()) {
    return invokeTauri('list_api_requests', { collectionId: collectionId ?? null })
  }
  if (window.scriptManagerDesktop?.runtime?.listApiRequests) {
    return window.scriptManagerDesktop.runtime.listApiRequests(collectionId ?? null)
  }
  const response = await axios.get('/api/api-requests', { params: collectionId ? { collectionId } : undefined })
  return response.data
}

export async function saveApiRequestRuntime(payload: unknown) {
  if (isTauri()) {
    return invokeTauri('save_api_request', { payload: payload as Record<string, unknown> })
  }
  if (window.scriptManagerDesktop?.runtime?.saveApiRequest) {
    return window.scriptManagerDesktop.runtime.saveApiRequest(payload)
  }
  const body = payload as Record<string, unknown>
  const response = body.id
    ? await axios.put(`/api/api-requests/${body.id}`, body)
    : await axios.post('/api/api-requests', body)
  return response.data
}

export async function deleteApiRequestRuntime(id: string) {
  if (isTauri()) {
    return invokeTauri('delete_api_request', { id })
  }
  if (window.scriptManagerDesktop?.runtime?.deleteApiRequest) {
    return window.scriptManagerDesktop.runtime.deleteApiRequest(id)
  }
  await axios.delete(`/api/api-requests/${id}`)
  return id
}

export async function listApiEnvironmentsRuntime() {
  if (isTauri()) {
    return invokeTauri('list_api_environments')
  }
  if (window.scriptManagerDesktop?.runtime?.listApiEnvironments) {
    return window.scriptManagerDesktop.runtime.listApiEnvironments()
  }
  const response = await axios.get('/api/api-environments')
  return response.data
}

export async function saveApiEnvironmentRuntime(payload: unknown) {
  if (isTauri()) {
    return invokeTauri('save_api_environment', { payload: payload as Record<string, unknown> })
  }
  if (window.scriptManagerDesktop?.runtime?.saveApiEnvironment) {
    return window.scriptManagerDesktop.runtime.saveApiEnvironment(payload)
  }
  const body = payload as Record<string, unknown>
  const response = body.id
    ? await axios.put(`/api/api-environments/${body.id}`, body)
    : await axios.post('/api/api-environments', body)
  return response.data
}

export async function deleteApiEnvironmentRuntime(id: string) {
  if (isTauri()) {
    return invokeTauri('delete_api_environment', { id })
  }
  if (window.scriptManagerDesktop?.runtime?.deleteApiEnvironment) {
    return window.scriptManagerDesktop.runtime.deleteApiEnvironment(id)
  }
  await axios.delete(`/api/api-environments/${id}`)
  return id
}

export async function readApiGlobalsRuntime() {
  if (isTauri()) {
    return invokeTauri('read_api_globals')
  }
  if (window.scriptManagerDesktop?.runtime?.readApiGlobals) {
    return window.scriptManagerDesktop.runtime.readApiGlobals()
  }
  const response = await axios.get('/api/api-globals')
  return response.data
}

export async function saveApiGlobalsRuntime(variables: string) {
  if (isTauri()) {
    return invokeTauri('save_api_globals', { variables })
  }
  if (window.scriptManagerDesktop?.runtime?.saveApiGlobals) {
    return window.scriptManagerDesktop.runtime.saveApiGlobals(variables)
  }
  const response = await axios.put('/api/api-globals', { variables })
  return response.data
}

export async function sendApiRequestRuntime(payload: unknown) {
  if (isTauri()) {
    return invokeTauri('send_api_request', { payload: payload as Record<string, unknown> })
  }
  if (window.scriptManagerDesktop?.runtime?.sendApiRequest) {
    return window.scriptManagerDesktop.runtime.sendApiRequest(payload)
  }
  const response = await axios.post('/api/proxy-request', payload)
  return response.data
}

export async function listApiHistoryRuntime() {
  if (isTauri()) {
    return invokeTauri('list_api_history')
  }
  if (window.scriptManagerDesktop?.runtime?.listApiHistory) {
    return window.scriptManagerDesktop.runtime.listApiHistory()
  }
  const response = await axios.get('/api/api-history')
  return response.data
}

export async function clearApiHistoryRuntime() {
  if (isTauri()) {
    return invokeTauri('clear_api_history')
  }
  if (window.scriptManagerDesktop?.runtime?.clearApiHistory) {
    return window.scriptManagerDesktop.runtime.clearApiHistory()
  }
  await axios.delete('/api/api-history')
  return { success: true }
}

export async function listApiCollectionRunsRuntime() {
  if (isTauri()) {
    return invokeTauri('list_api_collection_runs')
  }
  if (window.scriptManagerDesktop?.runtime?.listApiCollectionRuns) {
    return window.scriptManagerDesktop.runtime.listApiCollectionRuns()
  }
  const response = await axios.get('/api/api-collection-runs')
  return response.data
}

export type DataRow = Record<string, string>

export async function runApiCollectionRuntime(payload: { collectionId: string; environmentId: string | null; rows?: DataRow[] }) {
  if (isTauri()) {
    return invokeTauri('run_api_collection', { payload })
  }
  if (window.scriptManagerDesktop?.runtime?.runApiCollection) {
    return window.scriptManagerDesktop.runtime.runApiCollection(payload)
  }
  const response = await axios.post(`/api/api-collections/${payload.collectionId}/run`, { environmentId: payload.environmentId })
  return response.data
}

export type ApiAssertionRuntime = {
  id: string
  requestId: string
  name?: string | null
  kind: 'status' | 'latency_ms' | 'header' | 'body_path'
  target?: string | null
  operator: string
  expected: string
  enabled: boolean
  position: number
}

export async function listApiAssertionsRuntime(requestId: string): Promise<ApiAssertionRuntime[]> {
  if (isTauri()) {
    return invokeTauri<ApiAssertionRuntime[]>('list_api_assertions', { requestId })
  }
  if (window.scriptManagerDesktop?.runtime?.listApiAssertions) {
    return window.scriptManagerDesktop.runtime.listApiAssertions(requestId) as Promise<ApiAssertionRuntime[]>
  }
  return []
}

export async function saveApiAssertionsRuntime(payload: { requestId: string; assertions: Array<Partial<ApiAssertionRuntime>> }): Promise<ApiAssertionRuntime[]> {
  if (isTauri()) {
    return invokeTauri<ApiAssertionRuntime[]>('save_api_assertions', { payload })
  }
  if (window.scriptManagerDesktop?.runtime?.saveApiAssertions) {
    return window.scriptManagerDesktop.runtime.saveApiAssertions(payload) as Promise<ApiAssertionRuntime[]>
  }
  throw new Error('Desktop runtime unavailable')
}

export type DataSetRuntime = {
  id: string
  name: string
  kind: 'csv' | 'json'
  content: string
  createdAt: string
}

export async function listDataSetsRuntime(): Promise<DataSetRuntime[]> {
  if (isTauri()) return invokeTauri<DataSetRuntime[]>('list_data_sets')
  if (window.scriptManagerDesktop?.runtime?.listDataSets) {
    return window.scriptManagerDesktop.runtime.listDataSets() as Promise<DataSetRuntime[]>
  }
  return []
}

export async function saveDataSetRuntime(payload: { id?: string; name: string; kind: 'csv' | 'json'; content: string }): Promise<DataSetRuntime> {
  if (isTauri()) return invokeTauri<DataSetRuntime>('save_data_set', { payload })
  if (window.scriptManagerDesktop?.runtime?.saveDataSet) {
    return window.scriptManagerDesktop.runtime.saveDataSet(payload) as Promise<DataSetRuntime>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function deleteDataSetRuntime(id: string): Promise<boolean> {
  if (isTauri()) return invokeTauri<boolean>('delete_data_set', { id })
  if (window.scriptManagerDesktop?.runtime?.deleteDataSet) return window.scriptManagerDesktop.runtime.deleteDataSet(id)
  return false
}

export async function runScriptDataDrivenRuntime(payload: { scriptId: string; rows: DataRow[] }): Promise<Array<{ index: number; buildId: string; status: string }>> {
  if (isTauri()) return invokeTauri('run_script_data_driven', { payload })
  if (window.scriptManagerDesktop?.runtime?.runScriptDataDriven) {
    return window.scriptManagerDesktop.runtime.runScriptDataDriven(payload) as Promise<Array<{ index: number; buildId: string; status: string }>>
  }
  throw new Error('Desktop runtime unavailable')
}
