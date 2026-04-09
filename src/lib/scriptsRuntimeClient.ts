import axios from 'axios'

export function hasDesktopScriptsRuntime(): boolean {
  return Boolean(window.scriptManagerDesktop?.runtime)
}

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
  folder_path?: string | null
  is_temporary?: boolean
  runtime_preset?: 'general' | 'python' | 'node' | 'shell' | 'powershell'
  python_toolchain_enabled?: boolean
  python_venv_path?: string | null
  python_interpreter_path?: string | null
  created_at: string
}

type DesktopCreateCollectionPayload = {
  name: string
  projectId?: string | null
  runtimePreset?: DesktopCollectionRecord['runtime_preset']
  pythonToolchainEnabled?: boolean
}

type DesktopDeleteCollectionResult = {
  id: string
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

export async function setDesktopTerminalContext(scriptId: string | null) {
  if (!window.scriptManagerDesktop?.runtime) {
    return
  }

  await window.scriptManagerDesktop.runtime.setTerminalContext({ scriptId })
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

export async function warmScriptsTerminal(): Promise<void> {
  if (window.scriptManagerDesktop?.runtime) {
    await window.scriptManagerDesktop.runtime.warmTerminal()
    return
  }

  await fetch('/api/terminal/warm', { method: 'POST' })
}

export async function runScriptInDesktopTerminal(scriptId: string, paramValues?: Record<string, string>) {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  return window.scriptManagerDesktop.runtime.runScriptInTerminal({ scriptId, paramValues })
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

export async function sendDesktopTerminalInput(data: string) {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  await window.scriptManagerDesktop.runtime.sendTerminalInput(data)
}

export async function resizeDesktopTerminal(cols: number, rows: number) {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }

  await window.scriptManagerDesktop.runtime.resizeTerminal(cols, rows)
}

export async function closeDesktopTerminal() {
  if (!window.scriptManagerDesktop?.runtime) {
    return
  }

  await window.scriptManagerDesktop.runtime.closeTerminal()
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
