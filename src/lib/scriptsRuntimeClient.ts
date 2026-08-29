import axios from 'axios'

export function hasDesktopScriptsRuntime(): boolean {
  return Boolean(window.scriptManagerDesktop?.runtime)
}

export const DEFAULT_TERMINAL_SESSION_ID = 'terminal-1'

type DesktopCreateScriptPayload = {
  name: string
  description?: string
  syncToGist?: boolean
  content?: string
  language?: string
  interpreter?: string | null
  parameters?: unknown[]
  collectionId?: string | null
}

type DesktopSaveScriptPayload = {
  id: string
  name: string
  content: string
  sync_to_gist?: boolean
  language?: string
  interpreter?: string | null
  parameters?: unknown[]
  timeout_ms?: number | null
  collection_id?: string | null
}

type DesktopOpenFolderPayload = {
  folderPath: string
  mode: 'temporary' | 'collection'
  collectionName?: string
  runtimePreset?: 'general' | 'python' | 'node' | 'shell' | 'powershell'
  pythonToolchainEnabled?: boolean
  createVenvIfMissing?: boolean
}

type CanonicalRecoveryDraftPayload = {
  scriptId: string
  sourcePath: string
  sourceRevision: string
  content: string
}

export type CanonicalRecoveryDraft = CanonicalRecoveryDraftPayload & {
  id: string
  createdAt: string
}

export type CanonicalFolderChange = {
  type: 'changed' | 'deleted'
  collectionId: string
  sourcePath: string
  scriptId?: string
}

type DesktopScriptRecord = {
  id: string
  name: string
  filename: string
  description?: string | null
  content?: string
  language?: string
  interpreter?: string | null
  parameters?: unknown[]
  created_at: string
  updated_at: string
  last_run?: string | null
  webhook_token?: string
  schedule_cron?: string | null
  schedule_enabled?: boolean
  collection_id?: string | null
  gist_id?: string | null
  gist_url?: string | null
  sync_to_gist?: boolean
  tags?: Array<{ id: string; name: string; color: string }>
  timeout_ms?: number | null
  require_webhook_signature?: boolean
  webhook_secret_set?: boolean
  source_path?: string | null
}

type DesktopCollectionRecord = {
  id: string
  name: string
  description?: string
  script_count?: number
  project_id?: string | null
  parent_id?: string | null
  folder_path?: string | null
  is_temporary?: boolean
  runtime_preset?: 'general' | 'python' | 'node' | 'shell' | 'powershell'
  python_toolchain_enabled?: boolean
  python_venv_path?: string | null
  python_interpreter_path?: string | null
  storage_provider_id?: string | null
  remote_prefix?: string | null
  created_at: string
}

type DesktopCreateCollectionPayload = {
  name: string
  projectId?: string | null
  parentId?: string | null
  runtimePreset?: DesktopCollectionRecord['runtime_preset']
  pythonToolchainEnabled?: boolean
}

type DesktopUpdateCollectionPayload = {
  id: string
  name?: string
  projectId?: string | null
  parentId?: string | null
  storageProviderId?: string | null
  remotePrefix?: string | null
}

type DesktopUpdateCollectionResult = {
  updatedCollections: DesktopCollectionRecord[]
}

type DesktopDeleteCollectionResult = {
  id: string
  deletedCollectionIds: string[]
  deletedScriptIds: string[]
  deletedFolderPath: string | null
}

type DesktopFolderInspection = {
  hasVenv: boolean
  venvPath: string | null
  interpreterPath: string | null
  manifests: string[]
}

type DesktopCollectionWorkspaceStatus = {
  collection: DesktopCollectionRecord
  workspacePath: string | null
  hasVenv: boolean
  venvPath: string | null
  interpreterPath: string | null
  manifests: string[]
}

export async function listDesktopScripts(): Promise<DesktopScriptRecord[]> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.listScripts() as Promise<DesktopScriptRecord[]>
}

export async function listDesktopCollections(): Promise<DesktopCollectionRecord[]> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.listCollections() as Promise<DesktopCollectionRecord[]>
}

export async function createDesktopCollection(payload: DesktopCreateCollectionPayload): Promise<DesktopCollectionRecord> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.createCollection(payload) as Promise<DesktopCollectionRecord>
}

export async function updateDesktopCollection(payload: DesktopUpdateCollectionPayload): Promise<DesktopUpdateCollectionResult> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.updateCollection(payload) as Promise<DesktopUpdateCollectionResult>
}

export async function deleteDesktopCollection(id: string, hardDelete = false): Promise<DesktopDeleteCollectionResult> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.deleteCollection({ id, hardDelete }) as Promise<DesktopDeleteCollectionResult>
}

export async function inspectDesktopFolder(folderPath: string): Promise<DesktopFolderInspection> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.inspectFolder(folderPath) as Promise<DesktopFolderInspection>
}

export async function inspectDesktopCollectionWorkspace(collectionId: string): Promise<DesktopCollectionWorkspaceStatus> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.inspectCollectionWorkspace(collectionId) as Promise<DesktopCollectionWorkspaceStatus>
}

export async function manageDesktopCollectionPythonEnv(collectionId: string, recreate = false): Promise<DesktopCollectionWorkspaceStatus> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.manageCollectionPythonEnv({ collectionId, recreate }) as Promise<DesktopCollectionWorkspaceStatus>
}

export async function setDesktopTerminalContext(scriptId: string | null, sessionId = DEFAULT_TERMINAL_SESSION_ID) {
  if (!window.scriptManagerDesktop?.runtime) {
    return
  }

  await window.scriptManagerDesktop.runtime.setTerminalContext({ sessionId, scriptId })
}

export async function readDesktopScript(scriptId: string): Promise<DesktopScriptRecord> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.readScript(scriptId) as Promise<DesktopScriptRecord>
}

export async function createDesktopScript(payload: DesktopCreateScriptPayload): Promise<DesktopScriptRecord> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.createScript(payload) as Promise<DesktopScriptRecord>
}

export async function saveDesktopScript(payload: DesktopSaveScriptPayload): Promise<DesktopScriptRecord> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.saveScript(payload) as Promise<DesktopScriptRecord>
}

export async function deleteDesktopScript(id: string) {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.deleteScript({ id })
}

export async function duplicateDesktopScript(scriptId: string): Promise<DesktopScriptRecord> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.duplicateScript(scriptId) as Promise<DesktopScriptRecord>
}

export async function openDesktopScriptsFolder(payload: DesktopOpenFolderPayload): Promise<{
  collection: DesktopCollectionRecord
  scripts: Array<{ id: string; name: string }>
  imported_count: number
}> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.openFolder(payload) as Promise<{
    collection: DesktopCollectionRecord
    scripts: Array<{ id: string; name: string }>
    imported_count: number
  }>
}

export async function rescanCanonicalFolder(collectionId: string) {
  if (!window.scriptManagerDesktop?.runtime?.rescanCanonicalFolder) throw new Error('Desktop runtime unavailable')
  return window.scriptManagerDesktop.runtime.rescanCanonicalFolder(collectionId)
}

export async function listCanonicalRecoveryDrafts(scriptId: string) {
  if (!window.scriptManagerDesktop?.runtime?.listCanonicalRecoveryDrafts) throw new Error('Desktop runtime unavailable')
  return window.scriptManagerDesktop.runtime.listCanonicalRecoveryDrafts(scriptId) as Promise<CanonicalRecoveryDraft[]>
}

export async function saveCanonicalRecoveryDraft(payload: CanonicalRecoveryDraftPayload) {
  if (!window.scriptManagerDesktop?.runtime?.saveCanonicalRecoveryDraft) throw new Error('Desktop runtime unavailable')
  return window.scriptManagerDesktop.runtime.saveCanonicalRecoveryDraft(payload)
}

export async function discardCanonicalRecoveryDraft(draftId: string) {
  if (!window.scriptManagerDesktop?.runtime?.discardCanonicalRecoveryDraft) throw new Error('Desktop runtime unavailable')
  return window.scriptManagerDesktop.runtime.discardCanonicalRecoveryDraft(draftId)
}

export function subscribeToCanonicalFolderChanges(listener: (event: CanonicalFolderChange) => void): () => void {
  return window.scriptManagerDesktop?.runtime?.onCanonicalFolderChange?.(listener) ?? (() => undefined)
}

export async function warmScriptsTerminal(sessionId = DEFAULT_TERMINAL_SESSION_ID): Promise<void> {
  if (window.scriptManagerDesktop?.runtime) {
    await window.scriptManagerDesktop.runtime.warmTerminal({ sessionId })
    return
  }

  await fetch('/api/terminal/warm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
}

export async function runScriptInDesktopTerminal(scriptId: string, paramValues?: Record<string, string>, sessionId = DEFAULT_TERMINAL_SESSION_ID) {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.runScriptInTerminal({ sessionId, scriptId, paramValues })
}

export async function startDesktopLocalRun(scriptId: string, paramValues?: Record<string, string>, buildId?: string) {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.runScript({ scriptId, paramValues, buildId })
}

export function subscribeToDesktopTerminal(listener: (event: ScriptManagerDesktopTerminalEvent) => void) {
  return window.scriptManagerDesktop?.runtime?.onTerminalEvent(listener) ?? (() => undefined)
}

export function subscribeToDesktopBuildEvents(listener: (event: ScriptManagerDesktopBuildEvent) => void) {
  return window.scriptManagerDesktop?.runtime?.onBuildEvent(listener) ?? (() => undefined)
}

export async function sendDesktopTerminalInput(data: string, sessionId = DEFAULT_TERMINAL_SESSION_ID) {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  await window.scriptManagerDesktop.runtime.sendTerminalInput({ sessionId, data })
}

export async function resizeDesktopTerminal(cols: number, rows: number, sessionId = DEFAULT_TERMINAL_SESSION_ID) {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  await window.scriptManagerDesktop.runtime.resizeTerminal({ sessionId, cols, rows })
}

export async function closeDesktopTerminal(sessionId = DEFAULT_TERMINAL_SESSION_ID) {
  if (!window.scriptManagerDesktop?.runtime) {
    return
  }

  await window.scriptManagerDesktop.runtime.closeTerminal({ sessionId })
}

export async function readDesktopClipboardText(): Promise<string> {
  if (window.scriptManagerDesktop?.readClipboardText) {
    return window.scriptManagerDesktop.readClipboardText()
  }

  return navigator.clipboard.readText()
}

export async function copyDesktopClipboardText(value: string): Promise<void> {
  if (window.scriptManagerDesktop?.copyText) {
    await window.scriptManagerDesktop.copyText(value)
    return
  }

  await navigator.clipboard.writeText(value)
}

export async function startBrowserRun(scriptId: string, paramValues?: Record<string, string>, buildId?: string) {
  const response = await axios.post(`/api/scripts/${scriptId}/run`, { paramValues, buildId })
  return response.data as { build_id: string; status: string }
}

export async function buildBrowserTerminalCommand(scriptId: string, paramValues?: Record<string, string>) {
  const response = await fetch(`/api/scripts/${scriptId}/terminal-command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paramValues }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Failed to build terminal command' }))
    throw new Error(data.error ?? 'Failed to build terminal command')
  }

  return response.json() as Promise<{ command: string }>
}
