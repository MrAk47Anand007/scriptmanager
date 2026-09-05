import axios from 'axios'
import { invokeTauri } from '@/lib/tauriInvoke'
import { isDesktopRenderer } from '@/lib/runtime/desktopMode'

export function hasDesktopOpsRuntime(): boolean {
  return Boolean(window.scriptManagerDesktop?.runtime?.listProjects)
}

function isTauri(): boolean {
  return isDesktopRenderer()
}

export function subscribeToDesktopRemoteExec(listener: (event: ScriptManagerDesktopRemoteExecEvent) => void) {
  window.scriptManagerDesktop?.runtime?.onRemoteExecEvent(listener); return () => undefined;
}

export async function listProjectsRuntime() {
  if (isTauri()) {
    return invokeTauri('list_projects')
  }
  if (window.scriptManagerDesktop?.runtime?.listProjects) {
    return window.scriptManagerDesktop.runtime.listProjects()
  }
  const response = await axios.get('/api/projects')
  return response.data
}

export async function saveProjectRuntime(payload: Record<string, unknown>) {
  if (isTauri()) {
    return invokeTauri('save_project', { payload })
  }
  if (window.scriptManagerDesktop?.runtime?.saveProject) {
    return window.scriptManagerDesktop.runtime.saveProject(payload)
  }
  const response = payload.id
    ? await axios.put(`/api/projects/${payload.id}`, payload)
    : await axios.post('/api/projects', payload)
  return response.data
}

export async function deleteProjectRuntime(id: string) {
  if (isTauri()) {
    return invokeTauri('delete_project', { id })
  }
  if (window.scriptManagerDesktop?.runtime?.deleteProject) {
    return window.scriptManagerDesktop.runtime.deleteProject(id)
  }
  await axios.delete(`/api/projects/${id}`)
  return id
}

export async function assignCollectionToProjectRuntime(payload: { collectionId: string; projectId: string | null }) {
  if (isTauri()) {
    return invokeTauri('assign_collection_to_project', { payload })
  }
  if (window.scriptManagerDesktop?.runtime?.assignCollectionToProject) {
    return window.scriptManagerDesktop.runtime.assignCollectionToProject(payload)
  }
  await axios.put(`/api/collections/${payload.collectionId}`, { project_id: payload.projectId })
  return payload
}

export async function listServerProfilesRuntime() {
  if (window.scriptManagerDesktop?.runtime?.listServerProfiles) {
    return window.scriptManagerDesktop.runtime.listServerProfiles()
  }
  throw new Error('Desktop runtime unavailable')
}

export async function saveServerProfileRuntime(payload: Record<string, unknown>) {
  if (window.scriptManagerDesktop?.runtime?.saveServerProfile) {
    return window.scriptManagerDesktop.runtime.saveServerProfile(payload)
  }
  throw new Error('Desktop runtime unavailable')
}

export async function deleteServerProfileRuntime(id: string) {
  if (window.scriptManagerDesktop?.runtime?.deleteServerProfile) {
    return window.scriptManagerDesktop.runtime.deleteServerProfile(id)
  }
  throw new Error('Desktop runtime unavailable')
}

export async function testServerProfileConnectionRuntime(profileId: string) {
  if (window.scriptManagerDesktop?.runtime?.testServerProfileConnection) {
    return window.scriptManagerDesktop.runtime.testServerProfileConnection(profileId)
  }
  throw new Error('Desktop runtime unavailable')
}

export async function transferRemoteScriptRuntime(payload: Record<string, unknown>) {
  if (window.scriptManagerDesktop?.runtime?.transferRemoteScript) {
    return window.scriptManagerDesktop.runtime.transferRemoteScript(payload)
  }
  throw new Error('Desktop runtime unavailable')
}

export async function startRemoteExecutionRuntime(payload: Record<string, unknown>) {
  if (window.scriptManagerDesktop?.runtime?.startRemoteExecution) {
    return window.scriptManagerDesktop.runtime.startRemoteExecution(payload)
  }
  throw new Error('Desktop runtime unavailable')
}

export async function approveRemoteExecutionRuntime(id: string, note?: string) {
  if (window.scriptManagerDesktop?.runtime?.approveRemoteExecution) {
    return window.scriptManagerDesktop.runtime.approveRemoteExecution({ id, note })
  }
  throw new Error('Desktop runtime unavailable')
}

export async function rejectRemoteExecutionRuntime(id: string) {
  if (window.scriptManagerDesktop?.runtime?.rejectRemoteExecution) {
    return window.scriptManagerDesktop.runtime.rejectRemoteExecution(id)
  }
  throw new Error('Desktop runtime unavailable')
}

export async function listAuditLogRuntime(params?: { profileId?: string; scriptId?: string; limit?: number; offset?: number }) {
  if (window.scriptManagerDesktop?.runtime?.listAuditLog) {
    return window.scriptManagerDesktop.runtime.listAuditLog(params)
  }
  throw new Error('Desktop runtime unavailable')
}
