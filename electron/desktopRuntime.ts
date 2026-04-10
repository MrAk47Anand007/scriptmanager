import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { PrismaClient } from '@prisma/client'
import * as pty from 'node-pty'
import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getDesktopWorkspaceLayout, ensureDesktopWorkspaceLayout, sanitizeWorkspaceName } from '../src/lib/workspaceLayout'
import {
  clearApiHistory as clearDesktopApiHistory,
  deleteApiCollection as deleteDesktopApiCollection,
  deleteApiEnvironment as deleteDesktopApiEnvironment,
  deleteApiRequest as deleteDesktopApiRequest,
  listApiCollectionRuns as listDesktopApiCollectionRuns,
  listApiCollections as listDesktopApiCollections,
  listApiEnvironments as listDesktopApiEnvironments,
  listApiHistory as listDesktopApiHistory,
  listApiRequests as listDesktopApiRequests,
  readApiGlobals as readDesktopApiGlobals,
  runApiCollection as runDesktopApiCollection,
  saveApiCollection as saveDesktopApiCollection,
  saveApiEnvironment as saveDesktopApiEnvironment,
  saveApiGlobals as saveDesktopApiGlobals,
  saveApiRequest as saveDesktopApiRequest,
  sendApiRequest as sendDesktopApiRequest,
} from './apiRuntime'
import {
  approveExecution as approveDesktopRemoteExecution,
  assignCollectionToProject as assignDesktopCollectionToProject,
  deleteProject as deleteDesktopProject,
  deleteServerProfile as deleteDesktopServerProfile,
  getRemoteExecEmitter,
  listAuditLog as listDesktopAuditLog,
  listProjects as listDesktopProjects,
  listServerProfiles as listDesktopServerProfiles,
  rejectExecution as rejectDesktopRemoteExecution,
  saveProject as saveDesktopProject,
  saveServerProfile as saveDesktopServerProfile,
  startRemoteExec as startDesktopRemoteExecution,
  testConnection as testDesktopConnection,
  transferScript as transferDesktopRemoteScript,
} from './opsRuntime'

type TerminalEvent =
  | { type: 'connected' }
  | { type: 'data'; data: string }
  | { type: 'closed' }
  | { type: 'error'; message: string }

type BuildEvent =
  | { type: 'started'; buildId: string }
  | { type: 'line'; buildId: string; line: string }
  | { type: 'done'; buildId: string; status: 'success' | 'failure' | 'timeout'; exitCode: number }
  | { type: 'error'; buildId: string; message: string }

type RunScriptPayload = {
  scriptId: string
  paramValues?: Record<string, string>
  buildId?: string
}

type RunScriptInTerminalPayload = {
  scriptId: string
  paramValues?: Record<string, string>
}

type ScriptDto = {
  id: string
  name: string
  filename: string
  description: string | null
  language: string
  interpreter: string | null
  parameters: unknown[]
  created_at: string
  updated_at: string
  last_run: string | null
  webhook_token: string
  schedule_cron: string | null
  schedule_enabled: boolean
  collection_id: string | null
  gist_id: string | null
  gist_url: string | null
  sync_to_gist: boolean
  tags: Array<{ id: string; name: string; color: string }>
  timeout_ms: number | null
  require_webhook_signature: boolean
  webhook_secret_set: boolean
  source_path: string | null
}

type ScriptContentDto = Pick<
  ScriptDto,
  'id' | 'name' | 'filename' | 'language' | 'interpreter' | 'parameters' | 'source_path' | 'created_at' | 'updated_at'
> & {
  content: string
}

type CollectionDto = {
  id: string
  name: string
  description: string
  script_count: number
  project_id: string | null
  folder_path: string | null
  is_temporary: boolean
  runtime_preset: 'general' | 'python' | 'node' | 'shell' | 'powershell'
  python_toolchain_enabled: boolean
  python_venv_path: string | null
  python_interpreter_path: string | null
  created_at: string
}

type CollectionWorkspaceStatus = {
  collection: CollectionDto
  workspacePath: string | null
  hasVenv: boolean
  venvPath: string | null
  interpreterPath: string | null
  manifests: string[]
}

type CreateScriptPayload = {
  name: string
  description?: string
  syncToGist?: boolean
  content?: string
  language?: string
  interpreter?: string | null
  parameters?: unknown[]
  collectionId?: string | null
}

type SaveScriptPayload = {
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

type DeleteScriptPayload = {
  id: string
}

type OpenFolderPayload = {
  folderPath: string
  mode: 'temporary' | 'collection'
  collectionName?: string
  runtimePreset?: CollectionDto['runtime_preset']
  pythonToolchainEnabled?: boolean
  createVenvIfMissing?: boolean
}

type CreateCollectionPayload = {
  name: string
  projectId?: string | null
  runtimePreset?: CollectionDto['runtime_preset']
  pythonToolchainEnabled?: boolean
}

type DeleteCollectionPayload = {
  id: string
  hardDelete?: boolean
}

type ManageCollectionPythonEnvPayload = {
  collectionId: string
  recreate?: boolean
}

type CollectionRecord = {
  id: string
  name: string
  description: string | null
  projectId: string | null
  folderPath: string | null
  isTemporary: boolean
  runtimePreset: string
  pythonToolchainEnabled: boolean
  pythonVenvPath: string | null
  pythonInterpreterPath: string | null
  createdAt: Date
  _count?: { scripts: number }
}

type FolderInspection = {
  hasVenv: boolean
  venvPath: string | null
  interpreterPath: string | null
  manifests: string[]
}

type TerminalShellKind = 'powershell' | 'cmd' | 'posix'

type WindowRuntime = {
  terminal: pty.IPty | null
  terminalShellKind: TerminalShellKind | null
  terminalContextKey: string | null
  activeBuilds: Map<string, ReturnType<typeof spawn>>
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

const windowRuntimes = new Map<number, WindowRuntime>()
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_SCRIPT_VERSIONS = 10
const SCRIPT_EXTENSIONS = new Set(['.py', '.js', '.ts', '.sh', '.ps1', '.bat'])
const PYTHON_MANIFESTS = ['requirements.txt', 'pyproject.toml', 'Pipfile']
const SAFE_FILENAME_CHARS = /[^a-zA-Z0-9_.-]/g
const SETTINGS_CACHE_TTL_MS = 30_000

let cachedWorkspaceRoot: { value: string; expiresAt: number } | null = null

function normalizeRuntimePreset(value: string | null | undefined): CollectionDto['runtime_preset'] {
  if (value === 'python' || value === 'node' || value === 'shell' || value === 'powershell') {
    return value
  }
  return 'general'
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function powerShellEscape(value: string): string {
  return `'${value.replace(/'/g, `''`)}'`
}

function buildLocalTerminalCommand(opts: {
  filePath: string
  language: string
  interpreter?: string | null
  paramValues?: Record<string, string>
}): string {
  const { filePath, language, interpreter, paramValues } = opts
  const isWindows = process.platform === 'win32'

  let command: string
  let args: string[]

  switch (language) {
    case 'python':
      command = isWindows ? 'python' : 'python3'
      args = ['-u', filePath]
      break
    case 'node':
      command = 'node'
      args = [filePath]
      break
    case 'shell':
      if (isWindows) {
        command = 'cmd'
        args = ['/c', filePath]
      } else {
        command = 'bash'
        args = [filePath]
      }
      break
    case 'custom':
      command = interpreter ?? (isWindows ? 'python' : 'python3')
      args = [filePath]
      break
    default:
      command = isWindows ? 'python' : 'python3'
      args = ['-u', filePath]
      break
  }

  if (isWindows) {
    const envStatements = paramValues
      ? Object.entries(paramValues)
        .map(([key, value]) => `$env:${key.replace(/[^a-zA-Z0-9_]/g, '_')}=${powerShellEscape(String(value))}`)
        .join('; ')
      : ''

    const invocation = `& ${powerShellEscape(command)} ${args.map(powerShellEscape).join(' ')}`
    return envStatements ? `${envStatements}; ${invocation}` : invocation
  }

  const envPrefix = paramValues
    ? Object.entries(paramValues)
      .map(([key, value]) => `${key.replace(/[^a-zA-Z0-9_]/g, '_')}=${shellEscape(String(value))}`)
      .join(' ') + ' '
    : ''

  return `${envPrefix}${shellEscape(command)} ${args.map(shellEscape).join(' ')}`
}

function sanitizeScriptFilename(name: string, fallbackExtension = '.py'): string {
  const trimmed = name.trim()
  const ext = path.extname(trimmed) || fallbackExtension
  const baseName = path.basename(trimmed, ext).replace(SAFE_FILENAME_CHARS, '_').replace(/_+/g, '_').replace(/^[_\.]+|[_\.]+$/g, '')
  const safeBaseName = baseName || 'script'
  const safeExtension = ext.replace(/[^a-zA-Z0-9.]/g, '') || fallbackExtension
  return `${safeBaseName}${safeExtension.startsWith('.') ? safeExtension : `.${safeExtension}`}`
}

function serializeParameters(parameters: string | null): unknown[] {
  try {
    return JSON.parse(parameters ?? '[]')
  } catch {
    return []
  }
}

function serializeScriptRecord(script: {
  id: string
  name: string
  filename: string
  description: string | null
  language: string
  interpreter: string | null
  parameters: string | null
  createdAt: Date
  updatedAt: Date
  lastRun: Date | null
  webhookToken: string | null
  scheduleCron: string | null
  scheduleEnabled: boolean
  collectionId: string | null
  gistId: string | null
  gistUrl: string | null
  syncToGist: boolean
  tags?: Array<{ tag: { id: string; name: string; color: string } }>
  timeoutMs: number | null
  requireWebhookSignature: boolean
  webhookSecret: string | null
  sourcePath: string | null
}): ScriptDto {
  return {
    id: script.id,
    name: script.name,
    filename: script.filename,
    description: script.description,
    language: script.language,
    interpreter: script.interpreter,
    parameters: serializeParameters(script.parameters),
    created_at: script.createdAt.toISOString(),
    updated_at: script.updatedAt.toISOString(),
    last_run: script.lastRun?.toISOString() ?? null,
    webhook_token: script.webhookToken ?? '',
    schedule_cron: script.scheduleCron,
    schedule_enabled: script.scheduleEnabled,
    collection_id: script.collectionId,
    gist_id: script.gistId,
    gist_url: script.gistUrl,
    sync_to_gist: script.syncToGist,
    tags: script.tags?.map((entry) => ({
      id: entry.tag.id,
      name: entry.tag.name,
      color: entry.tag.color,
    })) ?? [],
    timeout_ms: script.timeoutMs,
    require_webhook_signature: script.requireWebhookSignature,
    webhook_secret_set: Boolean(script.webhookSecret),
    source_path: script.sourcePath,
  }
}

function serializeScriptContentRecord(script: {
  id: string
  name: string
  filename: string
  language: string
  interpreter: string | null
  parameters: string | null
  sourcePath: string | null
  createdAt: Date
  updatedAt: Date
}, content: string): ScriptContentDto {
  return {
    id: script.id,
    name: script.name,
    filename: script.filename,
    content,
    language: script.language,
    interpreter: script.interpreter,
    parameters: serializeParameters(script.parameters),
    source_path: script.sourcePath,
    created_at: script.createdAt.toISOString(),
    updated_at: script.updatedAt.toISOString(),
  }
}

function serializeCollectionRecord(collection: CollectionRecord): CollectionDto {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description ?? '',
    script_count: collection._count?.scripts ?? 0,
    project_id: collection.projectId ?? null,
    folder_path: collection.folderPath ?? null,
    is_temporary: collection.isTemporary,
    runtime_preset: normalizeRuntimePreset(collection.runtimePreset),
    python_toolchain_enabled: collection.pythonToolchainEnabled,
    python_venv_path: collection.pythonVenvPath ?? null,
    python_interpreter_path: collection.pythonInterpreterPath ?? null,
    created_at: collection.createdAt.toISOString(),
  }
}

function isSupportedScriptFile(fileName: string): boolean {
  return SCRIPT_EXTENSIONS.has(path.extname(fileName).toLowerCase())
}

function inferScriptLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.py') return 'python'
  if (ext === '.js' || ext === '.ts') return 'node'
  if (ext === '.sh' || ext === '.ps1' || ext === '.bat') return 'shell'
  return 'custom'
}

function getFolderDisplayName(folderPath: string): string {
  return path.basename(folderPath) || folderPath
}

function buildLinkedScriptName(folderPath: string, filePath: string): string {
  return path.relative(folderPath, filePath).replace(/\\/g, '/')
}

function listScriptFiles(folderPath: string): string[] {
  const results: string[] = []
  const walk = (currentPath: string) => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (isSupportedScriptFile(entry.name)) {
        results.push(fullPath)
      }
    }
  }

  walk(folderPath)
  return results.sort((a, b) => a.localeCompare(b))
}

function sanitizeCollectionFolderName(name: string): string {
  return sanitizeWorkspaceName(name, 'collection')
}

function toAbsolutePath(targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath)
}

async function getWorkspaceRoot(): Promise<string> {
  if (cachedWorkspaceRoot && cachedWorkspaceRoot.expiresAt > Date.now()) {
    return cachedWorkspaceRoot.value
  }

  const setting = await prisma.setting.findUnique({ where: { key: 'script_storage_path' } })
  const configured = setting?.value?.trim() || process.env.SCRIPTS_DIR || path.join(process.cwd(), 'user_scripts')
  const resolved = getDesktopWorkspaceLayout(toAbsolutePath(configured)).scriptsRoot
  cachedWorkspaceRoot = {
    value: resolved,
    expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
  }
  return resolved
}

function getVenvPaths(workspacePath: string) {
  const venvPath = path.join(workspacePath, '.venv')
  return {
    venvPath,
    interpreterPath: process.platform === 'win32'
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python'),
    activatePath: process.platform === 'win32'
      ? path.join(venvPath, 'Scripts', 'Activate.ps1')
      : path.join(venvPath, 'bin', 'activate'),
    cmdActivatePath: process.platform === 'win32'
      ? path.join(venvPath, 'Scripts', 'activate.bat')
      : path.join(venvPath, 'bin', 'activate'),
  }
}

function inspectFolderState(folderPath: string): FolderInspection {
  const { venvPath, interpreterPath } = getVenvPaths(folderPath)
  const manifests = PYTHON_MANIFESTS.filter((manifest) => fs.existsSync(path.join(folderPath, manifest)))
  return {
    hasVenv: fs.existsSync(venvPath) && fs.existsSync(interpreterPath),
    venvPath: fs.existsSync(venvPath) ? venvPath : null,
    interpreterPath: fs.existsSync(interpreterPath) ? interpreterPath : null,
    manifests,
  }
}

function getPythonCandidates(): Array<{ command: string; args: string[] }> {
  if (process.platform === 'win32') {
    return [
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
      { command: 'python3', args: [] },
    ]
  }

  return [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
  ]
}

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'ignore',
      env: process.env,
    })

    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`Command exited with code ${code ?? -1}`))
    })
  })
}

async function createPythonVenv(workspacePath: string, recreate = false): Promise<FolderInspection> {
  const { venvPath } = getVenvPaths(workspacePath)
  if (recreate && fs.existsSync(venvPath)) {
    fs.rmSync(venvPath, { recursive: true, force: true })
  }

  if (fs.existsSync(venvPath)) {
    return inspectFolderState(workspacePath)
  }

  let lastError: unknown = null
  for (const candidate of getPythonCandidates()) {
    try {
      await runCommand(candidate.command, [...candidate.args, '-m', 'venv', '.venv'], workspacePath)
      return inspectFolderState(workspacePath)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to create Python virtual environment')
}

function buildTerminalContextKey(cwd: string, venvPath: string | null): string {
  return `${cwd}::${venvPath ?? ''}`
}

async function isManagedCollectionWorkspace(folderPath: string | null | undefined): Promise<boolean> {
  if (!folderPath) {
    return false
  }

  const workspaceRoot = await getWorkspaceRoot()
  const normalizedRoot = path.resolve(workspaceRoot)
  const normalizedFolder = path.resolve(folderPath)
  const relative = path.relative(normalizedRoot, normalizedFolder)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function getScriptsDir(): string {
  const configured = process.env.SCRIPTS_DIR
  return getDesktopWorkspaceLayout(configured ? (path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured)) : path.join(process.cwd(), 'user_scripts')).scriptsRoot
}

function getBuildsDir(): string {
  const configured = process.env.BUILDS_DIR
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured)
  }
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'builds')
    : path.join(os.tmpdir(), 'ScriptManager', 'builds')
}

function getRuntime(windowId: number): WindowRuntime {
  let runtime = windowRuntimes.get(windowId)
  if (!runtime) {
    runtime = {
      terminal: null,
      terminalShellKind: null,
      terminalContextKey: null,
      activeBuilds: new Map(),
    }
    windowRuntimes.set(windowId, runtime)
  }
  return runtime
}

function sendTerminalEvent(webContents: WebContents, payload: TerminalEvent) {
  if (!webContents.isDestroyed()) {
    webContents.send('scriptmanager:runtime:terminal', payload)
  }
}

function sendBuildEvent(webContents: WebContents, payload: BuildEvent) {
  if (!webContents.isDestroyed()) {
    webContents.send('scriptmanager:runtime:build', payload)
  }
}

function sendRemoteExecEvent(
  webContents: WebContents,
  payload: { type: 'line'; remoteExecId: string; line: string } | { type: 'done'; remoteExecId: string; exitCode: number } | { type: 'error'; remoteExecId: string; message: string }
) {
  if (!webContents.isDestroyed()) {
    webContents.send('scriptmanager:runtime:remote-exec', payload)
  }
}

function resolveWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    throw new Error('Unable to resolve BrowserWindow')
  }
  return window
}

function getSessionTerminalShellCandidates() {
  const isWindows = process.platform === 'win32'
  if (isWindows) {
    return [
      { shell: 'pwsh.exe', args: ['-NoLogo'], kind: 'powershell' as const },
      { shell: 'powershell.exe', args: ['-NoLogo'], kind: 'powershell' as const },
      { shell: 'cmd.exe', args: [], kind: 'cmd' as const },
    ]
  }
  return [
    { shell: process.env.SHELL || 'bash', args: [], kind: 'posix' as const },
    { shell: 'bash', args: [], kind: 'posix' as const },
    { shell: 'sh', args: [], kind: 'posix' as const },
  ]
}

function createTerminalForWindow(window: BrowserWindow): pty.IPty {
  const env = {
    ...(process.env as NodeJS.ProcessEnv),
    TERM: 'xterm-256color',
  }
  const isWindows = process.platform === 'win32'
  const candidates = getSessionTerminalShellCandidates()

  let lastError: unknown = null
  for (const candidate of candidates) {
    try {
      const terminal = pty.spawn(candidate.shell, candidate.args, {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.platform === 'win32' ? process.cwd() : process.cwd(),
        env: env as { [key: string]: string },
        useConpty: isWindows,
      })
      const runtime = getRuntime(window.id)
      runtime.terminalShellKind = candidate.kind
      runtime.terminalContextKey = null

      terminal.onData((data) => {
        sendTerminalEvent(window.webContents, { type: 'data', data })
      })

      terminal.onExit(() => {
        const runtime = getRuntime(window.id)
        runtime.terminal = null
        runtime.terminalShellKind = null
        runtime.terminalContextKey = null
        sendTerminalEvent(window.webContents, { type: 'closed' })
      })

      sendTerminalEvent(window.webContents, { type: 'connected' })
      return terminal
    } catch (error) {
      lastError = error
      console.warn(`[DesktopRuntime] Failed to spawn ${candidate.shell}, trying fallback`, error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to start terminal shell')
}

function ensureTerminal(window: BrowserWindow): pty.IPty {
  const runtime = getRuntime(window.id)
  if (runtime.terminal) {
    return runtime.terminal
  }

  runtime.terminal = createTerminalForWindow(window)
  return runtime.terminal
}

async function getScriptRecord(scriptId: string) {
  return prisma.script.findUnique({
    where: { id: scriptId },
    select: {
      id: true,
      name: true,
      filename: true,
      sourcePath: true,
      language: true,
      interpreter: true,
      timeoutMs: true,
      collection: {
        select: {
          id: true,
          folderPath: true,
          runtimePreset: true,
          pythonToolchainEnabled: true,
          pythonVenvPath: true,
          pythonInterpreterPath: true,
        },
      },
    },
  })
}

type ScriptExecutionContext = {
  cwd: string
  venvPath: string | null
  interpreterPath: string | null
  manifests: string[]
  key: string
}

function resolveScriptPath(script: {
  filename: string
  sourcePath: string | null
  collection?: { folderPath: string | null } | null
}): string {
  if (script.sourcePath) {
    return path.resolve(script.sourcePath)
  }
  if (script.collection?.folderPath) {
    return path.resolve(script.collection.folderPath, path.basename(script.filename))
  }
  return path.resolve(getScriptsDir(), path.basename(script.filename))
}

async function getCollectionRecord(collectionId: string) {
  return prisma.collection.findUnique({
    where: { id: collectionId },
    include: { _count: { select: { scripts: true } } },
  })
}

async function hydrateCollectionPythonMetadata(collection: CollectionRecord): Promise<CollectionRecord> {
  if (!collection.folderPath) {
    return collection
  }

  const inspection = inspectFolderState(collection.folderPath)
  const shouldBackfill = inspection.hasVenv && (
    !collection.pythonToolchainEnabled ||
    collection.pythonVenvPath !== inspection.venvPath ||
    collection.pythonInterpreterPath !== inspection.interpreterPath
  )

  if (!shouldBackfill) {
    return collection
  }

  return prisma.collection.update({
    where: { id: collection.id },
    data: {
      pythonToolchainEnabled: true,
      pythonVenvPath: inspection.venvPath,
      pythonInterpreterPath: inspection.interpreterPath,
    },
    include: { _count: { select: { scripts: true } } },
  })
}

async function getScriptExecutionContext(script: {
  collection?: {
    folderPath: string | null
    pythonToolchainEnabled: boolean
    pythonVenvPath: string | null
    pythonInterpreterPath: string | null
  } | null
}): Promise<ScriptExecutionContext> {
  const cwd = script.collection?.folderPath ? path.resolve(script.collection.folderPath) : await getWorkspaceRoot()
  const inspection = script.collection?.folderPath ? inspectFolderState(script.collection.folderPath) : { hasVenv: false, venvPath: null, interpreterPath: null, manifests: [] }
  const venvPath = script.collection?.pythonToolchainEnabled ? (script.collection.pythonVenvPath ?? inspection.venvPath) : null
  const interpreterPath = script.collection?.pythonToolchainEnabled ? (script.collection.pythonInterpreterPath ?? inspection.interpreterPath) : null

  return {
    cwd,
    venvPath,
    interpreterPath,
    manifests: inspection.manifests,
    key: buildTerminalContextKey(cwd, venvPath),
  }
}

function buildTerminalContextCommands(cwd: string, venvPath: string | null, shellKind: TerminalShellKind): string {
  const escapedCwdSingle = powerShellEscape(cwd)
  const posixCwd = shellEscape(cwd)

  if (shellKind === 'cmd') {
    const activatePath = venvPath ? getVenvPaths(cwd).cmdActivatePath : null
    const activation = activatePath && fs.existsSync(activatePath)
      ? ` && call "${activatePath}"`
      : ''
    return `cd /d "${cwd}"${activation}\r`
  }

  if (shellKind === 'powershell') {
    const activatePath = venvPath ? getVenvPaths(cwd).activatePath : null
    const activation = activatePath && fs.existsSync(activatePath)
      ? `; if (Test-Path ${powerShellEscape(activatePath)}) { . ${powerShellEscape(activatePath)} }`
      : ''
    return `Set-Location -LiteralPath ${escapedCwdSingle}${activation}\r`
  }

  const activatePath = venvPath ? getVenvPaths(cwd).activatePath : null
  const activation = activatePath && fs.existsSync(activatePath)
    ? ` && . ${shellEscape(activatePath)}`
    : ''
  return `cd ${posixCwd}${activation}\n`
}

function applyTerminalContext(window: BrowserWindow, context: ScriptExecutionContext, force = false) {
  const runtime = getRuntime(window.id)
  const terminal = ensureTerminal(window)
  if (!force && runtime.terminalContextKey === context.key) {
    return
  }

  runtime.terminalContextKey = context.key
  if (runtime.terminalShellKind) {
    terminal.write(buildTerminalContextCommands(context.cwd, context.venvPath, runtime.terminalShellKind))
  }
}

function releaseWorkspaceFromTerminal(folderPath: string) {
  const normalizedFolder = path.resolve(folderPath)
  for (const runtime of windowRuntimes.values()) {
    if (!runtime.terminal) {
      continue
    }

    const activeContext = runtime.terminalContextKey?.split('::')[0]
    if (activeContext && path.resolve(activeContext) === normalizedFolder) {
      try {
        runtime.terminal.kill()
      } catch {}
      runtime.terminal = null
      runtime.terminalShellKind = null
      runtime.terminalContextKey = null
    }
  }
}

async function inspectCollectionWorkspace(collectionId: string): Promise<CollectionWorkspaceStatus> {
  const collection = await getCollectionRecord(collectionId)
  if (!collection) {
    throw new Error('Collection not found')
  }

  const hydrated = await hydrateCollectionPythonMetadata(collection)
  const workspacePath = hydrated.folderPath ? path.resolve(hydrated.folderPath) : null
  const inspection = workspacePath
    ? inspectFolderState(workspacePath)
    : { hasVenv: false, venvPath: null, interpreterPath: null, manifests: [] }

  return {
    collection: serializeCollectionRecord(hydrated),
    workspacePath,
    hasVenv: inspection.hasVenv,
    venvPath: inspection.venvPath,
    interpreterPath: inspection.interpreterPath,
    manifests: inspection.manifests,
  }
}

async function manageCollectionPythonEnv(payload: ManageCollectionPythonEnvPayload): Promise<CollectionWorkspaceStatus> {
  const collection = await getCollectionRecord(payload.collectionId)
  if (!collection) {
    throw new Error('Collection not found')
  }

  if (!collection.folderPath) {
    throw new Error('This collection does not have a workspace folder')
  }

  const workspacePath = path.resolve(collection.folderPath)
  const inspection = await createPythonVenv(workspacePath, Boolean(payload.recreate))
  const updated = await prisma.collection.update({
    where: { id: collection.id },
    data: {
      pythonToolchainEnabled: true,
      pythonVenvPath: inspection.venvPath,
      pythonInterpreterPath: inspection.interpreterPath,
    },
    include: { _count: { select: { scripts: true } } },
  })

  return {
    collection: serializeCollectionRecord(updated),
    workspacePath,
    hasVenv: inspection.hasVenv,
    venvPath: inspection.venvPath,
    interpreterPath: inspection.interpreterPath,
    manifests: inspection.manifests,
  }
}

async function getTimeoutMs(scriptTimeoutMs: number | null | undefined): Promise<number> {
  if (scriptTimeoutMs && scriptTimeoutMs > 0) {
    return scriptTimeoutMs
  }

  const setting = await prisma.setting.findUnique({ where: { key: 'execution_timeout_ms' } })
  if (!setting?.value) {
    return DEFAULT_TIMEOUT_MS
  }

  const parsed = Number.parseInt(setting.value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
}

async function ensureScriptsDirExists() {
  ensureDesktopWorkspaceLayout(getDesktopWorkspaceLayout(await getConfiguredWorkspaceRootValue()))
  fs.mkdirSync(getBuildsDir(), { recursive: true })
}

async function getConfiguredWorkspaceRootValue() {
  const setting = await prisma.setting.findUnique({ where: { key: 'script_storage_path' } })
  return toAbsolutePath(setting?.value?.trim() || process.env.SCRIPTS_DIR || path.join(process.cwd(), 'user_scripts'))
}

async function listCollections(): Promise<CollectionDto[]> {
  const collections = await prisma.collection.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { scripts: true } } },
  })

  const hydrated = await Promise.all(collections.map((collection) => hydrateCollectionPythonMetadata(collection)))
  return hydrated.map(serializeCollectionRecord)
}

async function listScripts(): Promise<ScriptDto[]> {
  const scripts = await prisma.script.findMany({
    orderBy: { name: 'asc' },
    include: { collection: true, tags: { include: { tag: true } } },
  })

  return scripts.map(serializeScriptRecord)
}

async function readScript(scriptId: string): Promise<ScriptContentDto> {
  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    select: {
      id: true,
      name: true,
      filename: true,
      language: true,
      interpreter: true,
      parameters: true,
      sourcePath: true,
      collection: {
        select: {
          folderPath: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!script) {
    throw new Error('Script not found')
  }

  const filePath = resolveScriptPath(script)
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  return serializeScriptContentRecord(script, content)
}

async function createLocalCollection(payload: CreateCollectionPayload): Promise<CollectionDto> {
  const name = payload.name.trim()
  if (!name) {
    throw new Error('Name is required')
  }

  const workspaceRoot = await getWorkspaceRoot()
  fs.mkdirSync(workspaceRoot, { recursive: true })

  let folderName = sanitizeCollectionFolderName(name)
  let folderPath = path.join(workspaceRoot, folderName)
  let suffix = 2
  while (fs.existsSync(folderPath)) {
    folderName = `${sanitizeCollectionFolderName(name)}_${suffix++}`
    folderPath = path.join(workspaceRoot, folderName)
  }

  fs.mkdirSync(folderPath, { recursive: true })
  let pythonInspection = inspectFolderState(folderPath)
  const pythonToolchainEnabled = payload.runtimePreset === 'python' ? true : Boolean(payload.pythonToolchainEnabled)
  if (pythonToolchainEnabled) {
    pythonInspection = await createPythonVenv(folderPath)
  }

  const collection = await prisma.collection.create({
    data: {
      name,
      description: '',
      projectId: payload.projectId ?? null,
      folderPath,
      isTemporary: false,
      runtimePreset: payload.runtimePreset ?? 'general',
      pythonToolchainEnabled,
      pythonVenvPath: pythonInspection.venvPath,
      pythonInterpreterPath: pythonInspection.interpreterPath,
    },
    include: { _count: { select: { scripts: true } } },
  })

  return serializeCollectionRecord(collection)
}

async function deleteLocalCollection(payload: DeleteCollectionPayload): Promise<{
  id: string
  deletedScriptIds: string[]
  deletedFolderPath: string | null
}> {
  const collection = await prisma.collection.findUnique({
    where: { id: payload.id },
    include: {
      scripts: {
        select: { id: true },
      },
    },
  })

  if (!collection) {
    throw new Error('Collection not found')
  }

  const deletedScriptIds = collection.scripts.map((script) => script.id)
  const hardDelete = Boolean(payload.hardDelete)
  const managedWorkspace = await isManagedCollectionWorkspace(collection.folderPath)
  const shouldDeleteWorkspace = managedWorkspace && (hardDelete || !collection.isTemporary)

  if (hardDelete || shouldDeleteWorkspace) {
    await prisma.$transaction(async (tx) => {
      if (deletedScriptIds.length > 0) {
        await tx.script.deleteMany({
          where: { collectionId: collection.id },
        })
      }

      await tx.collection.delete({
        where: { id: collection.id },
      })
    })

    if (shouldDeleteWorkspace && collection.folderPath && fs.existsSync(collection.folderPath)) {
      releaseWorkspaceFromTerminal(collection.folderPath)
      fs.rmSync(path.resolve(collection.folderPath), {
        recursive: true,
        force: true,
        maxRetries: 6,
        retryDelay: 150,
      })
    }

    return {
      id: collection.id,
      deletedScriptIds,
      deletedFolderPath: shouldDeleteWorkspace ? path.resolve(collection.folderPath!) : null,
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.script.updateMany({
      where: { collectionId: collection.id },
      data: { collectionId: null },
    })

    await tx.collection.delete({
      where: { id: collection.id },
    })
  })

  return {
    id: collection.id,
    deletedScriptIds: [],
    deletedFolderPath: null,
  }
}

async function createVersionSnapshot(scriptId: string, content: string) {
  const latestVersion = await prisma.scriptVersion.findFirst({
    where: { scriptId },
    orderBy: { snapshotNumber: 'desc' },
    select: { snapshotNumber: true },
  })

  const nextSnapshotNumber = (latestVersion?.snapshotNumber ?? 0) + 1
  await prisma.scriptVersion.create({
    data: { scriptId, content, snapshotNumber: nextSnapshotNumber },
  })

  const allVersions = await prisma.scriptVersion.findMany({
    where: { scriptId },
    orderBy: { snapshotNumber: 'desc' },
    select: { id: true },
  })

  if (allVersions.length > MAX_SCRIPT_VERSIONS) {
    await prisma.scriptVersion.deleteMany({
      where: { id: { in: allVersions.slice(MAX_SCRIPT_VERSIONS).map((version) => version.id) } },
    })
  }
}

async function createLocalScript(payload: CreateScriptPayload): Promise<ScriptDto> {
  const name = payload.name.trim()
  if (!name) {
    throw new Error('Name is required')
  }

  await ensureScriptsDirExists()

  const existing = await prisma.script.findUnique({ where: { name } })
  if (existing) {
    throw new Error('A script with this name already exists')
  }

  const collection = payload.collectionId
    ? await prisma.collection.findUnique({ where: { id: payload.collectionId } })
    : null
  const runtimePreset = collection?.runtimePreset ?? 'general'
  const defaultExtension = runtimePreset === 'node' ? '.js' : runtimePreset === 'shell' || runtimePreset === 'powershell' ? '.sh' : '.py'
  const filename = sanitizeScriptFilename(name, defaultExtension)
  const workspaceRoot = collection?.folderPath ? path.resolve(collection.folderPath) : await getWorkspaceRoot()
  fs.mkdirSync(workspaceRoot, { recursive: true })
  const filePath = path.join(workspaceRoot, filename)

  if (fs.existsSync(filePath)) {
    throw new Error(collection?.folderPath
      ? 'A file with this name already exists in the collection workspace'
      : 'A file with this name already exists in the local scripts folder')
  }

  const globalGistSetting = await prisma.setting.findUnique({
    where: { key: 'gist_sync_enabled' },
  })
  const defaultSyncToGist = globalGistSetting?.value === 'true'
  const initialContent = payload.content ?? '# New script\nprint("Hello World")\n'
  fs.writeFileSync(filePath, initialContent, 'utf8')

  const isManagedCollection = await isManagedCollectionWorkspace(collection?.folderPath)

  const script = await prisma.script.create({
    data: {
      name,
      description: payload.description,
      filename,
      language: payload.language ?? 'python',
      interpreter: payload.language === 'custom' ? (payload.interpreter ?? null) : null,
      syncToGist: payload.syncToGist ?? defaultSyncToGist,
      parameters: JSON.stringify(Array.isArray(payload.parameters) ? payload.parameters : []),
      webhookToken: crypto.randomUUID().replace(/-/g, ''),
      collectionId: collection?.id ?? null,
      sourcePath: collection?.folderPath && !isManagedCollection ? filePath : null,
    },
    include: { tags: { include: { tag: true } } },
  })

  return serializeScriptRecord(script)
}

async function saveLocalScript(payload: SaveScriptPayload): Promise<ScriptDto> {
  const script = await prisma.script.findUnique({
    where: { id: payload.id },
    include: { collection: true, tags: { include: { tag: true } } },
  })

  if (!script) {
    throw new Error('Script not found')
  }

  const filePath = resolveScriptPath(script)
  fs.writeFileSync(filePath, payload.content, 'utf8')
  await createVersionSnapshot(script.id, payload.content)

  const updated = await prisma.script.update({
    where: { id: payload.id },
    data: {
      name: payload.name,
      description: script.description,
      language: payload.language ?? script.language,
      interpreter: payload.language === 'custom' ? (payload.interpreter ?? null) : null,
      syncToGist: payload.sync_to_gist ?? script.syncToGist,
      parameters: JSON.stringify(Array.isArray(payload.parameters) ? payload.parameters : serializeParameters(script.parameters)),
      timeoutMs: payload.timeout_ms !== undefined ? (payload.timeout_ms || null) : script.timeoutMs,
      collectionId: payload.collection_id !== undefined ? (payload.collection_id || null) : script.collectionId,
      updatedAt: new Date(),
    },
    include: { tags: { include: { tag: true } } },
  })

  return serializeScriptRecord(updated)
}

async function deleteLocalScript(payload: DeleteScriptPayload): Promise<string> {
  const script = await prisma.script.findUnique({ where: { id: payload.id }, include: { collection: true } })
  if (!script) {
    throw new Error('Script not found')
  }

  const filePath = resolveScriptPath(script)
  const shouldDeleteFile = !script.sourcePath || await isManagedCollectionWorkspace(script.collection?.folderPath)
  if (shouldDeleteFile && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }

  await prisma.script.delete({ where: { id: payload.id } })
  return payload.id
}

async function duplicateLocalScript(scriptId: string): Promise<ScriptDto> {
  const original = await prisma.script.findUnique({
    where: { id: scriptId },
    include: { tags: { include: { tag: true } }, collection: true },
  })

  if (!original) {
    throw new Error('Script not found')
  }

  await ensureScriptsDirExists()

  const originalPath = resolveScriptPath(original)
  let content = '# Duplicated script\n'
  if (fs.existsSync(originalPath)) {
    content = fs.readFileSync(originalPath, 'utf8')
  }

  const baseName = `${original.name} (copy)`
  let newName = baseName
  let counter = 2
  while (await prisma.script.findUnique({ where: { name: newName } })) {
    newName = `${baseName} ${counter++}`
  }

  const ext = original.filename.includes('.') ? `.${original.filename.split('.').pop()}` : '.py'
  const newFilename = sanitizeScriptFilename(newName, ext)
  const newPath = path.join(original.collection?.folderPath ? path.resolve(original.collection.folderPath) : await getWorkspaceRoot(), newFilename)

  if (fs.existsSync(newPath)) {
    throw new Error('A file with the duplicate name already exists')
  }

  fs.writeFileSync(newPath, content, 'utf8')
  const isManagedCollection = await isManagedCollectionWorkspace(original.collection?.folderPath)

  const copy = await prisma.script.create({
    data: {
      name: newName,
      filename: newFilename,
      description: original.description,
      language: original.language,
      interpreter: original.interpreter,
      parameters: original.parameters,
      collectionId: original.collectionId,
      sourcePath: original.collection?.folderPath && !isManagedCollection ? newPath : null,
      timeoutMs: original.timeoutMs,
      webhookToken: crypto.randomUUID().replace(/-/g, ''),
    },
    include: { tags: { include: { tag: true } } },
  })

  for (const scriptTag of original.tags) {
    await prisma.scriptTag.create({
      data: { scriptId: copy.id, tagId: scriptTag.tagId },
    })
  }

  const hydratedCopy = await prisma.script.findUnique({
    where: { id: copy.id },
    include: { tags: { include: { tag: true } } },
  })

  if (!hydratedCopy) {
    throw new Error('Failed to load duplicated script')
  }

  return serializeScriptRecord(hydratedCopy)
}

async function buildUniqueScriptName(baseName: string, currentSourcePath: string): Promise<string> {
  let candidate = baseName
  let suffix = 2

  while (true) {
    const existing = await prisma.script.findUnique({ where: { name: candidate } })
    if (!existing || existing.sourcePath === currentSourcePath) {
      return candidate
    }
    candidate = `${baseName} (${suffix++})`
  }
}

async function openLocalFolder(payload: OpenFolderPayload) {
  const folderPath = payload.folderPath.trim()
  if (!folderPath) {
    throw new Error('Folder path is required')
  }

  const resolvedFolderPath = path.resolve(folderPath)
  if (!fs.existsSync(resolvedFolderPath) || !fs.statSync(resolvedFolderPath).isDirectory()) {
    throw new Error('Selected folder does not exist')
  }

  const files = listScriptFiles(resolvedFolderPath)
  if (files.length === 0) {
    throw new Error('No supported script files found in that folder')
  }

  if (payload.mode === 'temporary') {
    const tempCollections = await prisma.collection.findMany({
      where: { isTemporary: true, folderPath: { not: null } },
      select: { id: true },
    })

    if (tempCollections.length > 0) {
      const tempIds = tempCollections.map((collection) => collection.id)
      await prisma.script.deleteMany({ where: { collectionId: { in: tempIds } } })
      await prisma.collection.deleteMany({ where: { id: { in: tempIds } } })
    }
  }

  const requestedPythonTools = payload.runtimePreset === 'python' ? true : Boolean(payload.pythonToolchainEnabled)
  let inspection = inspectFolderState(resolvedFolderPath)
  let collection = payload.mode === 'collection'
    ? await prisma.collection.findFirst({ where: { folderPath: resolvedFolderPath } })
    : null

  if (!collection) {
    collection = await prisma.collection.create({
      data: {
        name: (payload.collectionName?.trim() || getFolderDisplayName(resolvedFolderPath)) + (payload.mode === 'temporary' ? ' (Temporary)' : ''),
        folderPath: resolvedFolderPath,
        isTemporary: payload.mode === 'temporary',
        runtimePreset: payload.runtimePreset ?? 'general',
        pythonToolchainEnabled: inspection.hasVenv || requestedPythonTools,
        pythonVenvPath: inspection.venvPath,
        pythonInterpreterPath: inspection.interpreterPath,
      },
      include: { _count: { select: { scripts: true } } },
    })
  } else {
    if (!inspection.hasVenv && requestedPythonTools && payload.createVenvIfMissing) {
      inspection = await createPythonVenv(resolvedFolderPath)
    }
    collection = await prisma.collection.update({
      where: { id: collection.id },
      data: {
        name: payload.collectionName?.trim() || collection.name,
        isTemporary: payload.mode === 'temporary',
        runtimePreset: payload.runtimePreset ?? collection.runtimePreset,
        pythonToolchainEnabled: inspection.hasVenv || requestedPythonTools,
        pythonVenvPath: inspection.venvPath,
        pythonInterpreterPath: inspection.interpreterPath,
      },
      include: { _count: { select: { scripts: true } } },
    })
  }

  if (!inspection.hasVenv && requestedPythonTools && payload.createVenvIfMissing) {
    inspection = await createPythonVenv(resolvedFolderPath)
    collection = await prisma.collection.update({
      where: { id: collection.id },
      data: {
        pythonToolchainEnabled: true,
        pythonVenvPath: inspection.venvPath,
        pythonInterpreterPath: inspection.interpreterPath,
      },
      include: { _count: { select: { scripts: true } } },
    })
  }

  const existingScripts = await prisma.script.findMany({
    where: { collectionId: collection.id, sourcePath: { not: null } },
    select: { id: true, sourcePath: true },
  })
  const existingBySourcePath = new Map(
    existingScripts
      .filter((script): script is { id: string; sourcePath: string } => Boolean(script.sourcePath))
      .map((script) => [script.sourcePath, script]),
  )

  const activeSourcePaths = new Set<string>()
  const linkedScripts: Array<{ id: string; name: string }> = []

  for (const filePath of files) {
    activeSourcePaths.add(filePath)
    const baseName = buildLinkedScriptName(resolvedFolderPath, filePath)
    const uniqueName = await buildUniqueScriptName(`${getFolderDisplayName(resolvedFolderPath)}/${baseName}`, filePath)
    const filename = path.basename(filePath)
    const language = inferScriptLanguage(filePath)
    const existing = existingBySourcePath.get(filePath)

    if (existing) {
      const updated = await prisma.script.update({
        where: { id: existing.id },
        data: {
          name: uniqueName,
          filename,
          sourcePath: filePath,
          language,
          collectionId: collection.id,
        },
      })
      linkedScripts.push({ id: updated.id, name: updated.name })
      continue
    }

    const created = await prisma.script.create({
      data: {
        name: uniqueName,
        filename,
        sourcePath: filePath,
        language,
        collectionId: collection.id,
        webhookToken: crypto.randomUUID().replace(/-/g, ''),
      },
    })
    linkedScripts.push({ id: created.id, name: created.name })
  }

  const staleScriptIds = existingScripts
    .filter((script) => script.sourcePath && !activeSourcePaths.has(script.sourcePath))
    .map((script) => script.id)

  if (staleScriptIds.length > 0) {
    await prisma.script.deleteMany({ where: { id: { in: staleScriptIds } } })
  }

  return {
    collection: serializeCollectionRecord({ ...collection, _count: { scripts: linkedScripts.length } }),
    scripts: linkedScripts,
    imported_count: linkedScripts.length,
  }
}

function resolveInterpreter(language: string, interpreter: string | null | undefined, scriptPath: string): [string, string[]] {
  switch (language) {
    case 'python':
      return [interpreter ?? (process.platform === 'win32' ? 'python' : 'python3'), ['-u', scriptPath]]
    case 'node':
      return ['node', [scriptPath]]
    case 'shell':
      return interpreter
        ? [interpreter, [scriptPath]]
        : (process.platform === 'win32' ? ['cmd.exe', ['/c', scriptPath]] : ['bash', [scriptPath]])
    case 'custom':
      return [interpreter ?? (process.platform === 'win32' ? 'python' : 'python3'), [scriptPath]]
    case 'powershell':
      return process.platform === 'win32'
        ? [interpreter ?? 'powershell.exe', ['-NoLogo', '-File', scriptPath]]
        : [interpreter ?? 'pwsh', ['-NoLogo', '-File', scriptPath]]
    default:
      return [process.platform === 'win32' ? 'python' : 'python3', ['-u', scriptPath]]
  }
}

function getBuildLogPath(scriptFilename: string, buildId: string): string {
  const buildsDir = getBuildsDir()
  const safeScriptDir = path.basename(scriptFilename).replace(/[^a-zA-Z0-9_.-]/g, '_')
  const targetDir = path.join(buildsDir, safeScriptDir)
  fs.mkdirSync(targetDir, { recursive: true })
  return path.join(targetDir, `${buildId}.log`)
}

async function startLocalRun(window: BrowserWindow, payload: RunScriptPayload) {
  const script = await getScriptRecord(payload.scriptId)
  if (!script) {
    throw new Error('Script not found')
  }

  const buildId = payload.buildId?.trim() || crypto.randomUUID()
  const logFile = getBuildLogPath(script.filename, buildId)
  const scriptPath = resolveScriptPath(script)
  const executionContext = await getScriptExecutionContext(script)
  const timeoutMs = await getTimeoutMs(script.timeoutMs)
  const envVars = await prisma.scriptEnvVar.findMany({ where: { scriptId: script.id } })

  await prisma.build.create({
    data: {
      id: buildId,
      scriptId: script.id,
      status: 'pending',
      triggeredBy: 'manual',
      logFile,
    },
  })

  sendBuildEvent(window.webContents, { type: 'started', buildId })

  if (!fs.existsSync(scriptPath)) {
    const message = `Script file not found: ${scriptPath}`
    await prisma.build.update({
      where: { id: buildId },
      data: {
        status: 'failure',
        exitCode: 1,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    })
    sendBuildEvent(window.webContents, { type: 'error', buildId, message })
    sendBuildEvent(window.webContents, { type: 'done', buildId, status: 'failure', exitCode: 1 })
    return { buildId, status: 'failed' as const }
  }

  const [cmd, args] = resolveInterpreter(
    script.language,
    (script.collection?.pythonToolchainEnabled ? (script.collection.pythonInterpreterPath ?? executionContext.interpreterPath) : null)
      ?? script.interpreter,
    scriptPath,
  )
  const runtime = getRuntime(window.id)
  const scriptEnv: Record<string, string> = {}
  for (const entry of envVars) {
    scriptEnv[entry.key] = entry.value
  }

  const paramEnv: Record<string, string> = {}
  if (payload.paramValues) {
    for (const [key, value] of Object.entries(payload.paramValues)) {
      paramEnv[key.replace(/[^a-zA-Z0-9_]/g, '_')] = String(value)
    }
  }

  const logStream = fs.createWriteStream(logFile, { encoding: 'utf8' })
  await prisma.build.update({
    where: { id: buildId },
    data: {
      status: 'running',
      startedAt: new Date(),
    },
  })

  const child = spawn(cmd, args, {
    cwd: executionContext.cwd,
    env: { ...process.env, PYTHONUNBUFFERED: '1', ...scriptEnv, ...paramEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  runtime.activeBuilds.set(buildId, child)
  let timedOut = false
  const timeoutHandle = setTimeout(() => {
    timedOut = true
    const line = `\n[ScriptManager] Execution timed out after ${Math.round(timeoutMs / 1000)}s. Killing process...\n`
    logStream.write(line)
    sendBuildEvent(window.webContents, { type: 'line', buildId, line })
    child.kill('SIGTERM')
  }, timeoutMs)

  const onData = (chunk: Buffer) => {
    const line = chunk.toString()
    logStream.write(line)
    sendBuildEvent(window.webContents, { type: 'line', buildId, line })
  }

  child.stdout.on('data', onData)
  child.stderr.on('data', onData)

  child.on('error', async (error) => {
    clearTimeout(timeoutHandle)
    runtime.activeBuilds.delete(buildId)
    logStream.end()
    await prisma.build.update({
      where: { id: buildId },
      data: {
        status: 'failure',
        exitCode: -1,
        finishedAt: new Date(),
      },
    }).catch(() => undefined)
    sendBuildEvent(window.webContents, { type: 'error', buildId, message: error.message })
    sendBuildEvent(window.webContents, { type: 'done', buildId, status: 'failure', exitCode: -1 })
  })

  child.on('close', async (code) => {
    clearTimeout(timeoutHandle)
    runtime.activeBuilds.delete(buildId)
    logStream.end()
    const exitCode = code ?? -1
    const status = timedOut ? 'timeout' : (exitCode === 0 ? 'success' : 'failure')
    await prisma.build.update({
      where: { id: buildId },
      data: {
        status,
        exitCode,
        finishedAt: new Date(),
      },
    }).catch(() => undefined)
    await prisma.script.update({
      where: { id: script.id },
      data: { lastRun: new Date() },
    }).catch(() => undefined)
    sendBuildEvent(window.webContents, { type: 'done', buildId, status, exitCode })
  })

  return { buildId, status: 'started' as const }
}

function forwardRemoteExecutionToWindow(window: BrowserWindow, remoteExecId: string) {
  const emitter = getRemoteExecEmitter(remoteExecId)
  if (!emitter) {
    return
  }

  const onLine = (line: string) => {
    sendRemoteExecEvent(window.webContents, { type: 'line', remoteExecId, line })
  }
  const onDone = (exitCode: number) => {
    sendRemoteExecEvent(window.webContents, { type: 'done', remoteExecId, exitCode })
    emitter.removeListener('line', onLine)
    emitter.removeListener('done', onDone)
  }

  emitter.on('line', onLine)
  emitter.once('done', onDone)
}

function destroyWindowRuntime(windowId: number) {
  const runtime = windowRuntimes.get(windowId)
  if (!runtime) return

  if (runtime.terminal) {
    try {
      runtime.terminal.kill()
    } catch {}
  }

  for (const child of runtime.activeBuilds.values()) {
    try {
      child.kill('SIGTERM')
    } catch {}
  }

  runtime.activeBuilds.clear()
  windowRuntimes.delete(windowId)
}

export function attachDesktopRuntime(window: BrowserWindow) {
  const handleClosed = () => destroyWindowRuntime(window.id)
  window.once('closed', handleClosed)
}

export function warmWindowDesktopRuntime(window: BrowserWindow) {
  try {
    ensureTerminal(window)
  } catch (error) {
    console.error('[DesktopRuntime] Failed to warm terminal runtime:', error)
  }
}

export function initDesktopRuntimeIpc() {
  ipcMain.handle('scriptmanager:runtime:list-scripts', async () => {
    return listScripts()
  })

  ipcMain.handle('scriptmanager:runtime:list-collections', async () => {
    return listCollections()
  })

  ipcMain.handle('scriptmanager:runtime:create-collection', async (_event, payload: CreateCollectionPayload) => {
    return createLocalCollection(payload)
  })

  ipcMain.handle('scriptmanager:runtime:delete-collection', async (_event, payload: DeleteCollectionPayload) => {
    return deleteLocalCollection(payload)
  })

  ipcMain.handle('scriptmanager:runtime:inspect-folder', async (_event, folderPath: string) => {
    return inspectFolderState(path.resolve(folderPath))
  })

  ipcMain.handle('scriptmanager:runtime:inspect-collection-workspace', async (_event, collectionId: string) => {
    return inspectCollectionWorkspace(collectionId)
  })

  ipcMain.handle('scriptmanager:runtime:manage-collection-python-env', async (_event, payload: ManageCollectionPythonEnvPayload) => {
    return manageCollectionPythonEnv(payload)
  })

  ipcMain.handle('scriptmanager:runtime:read-script', async (_event, scriptId: string) => {
    return readScript(scriptId)
  })

  ipcMain.handle('scriptmanager:runtime:create-script', async (_event, payload: CreateScriptPayload) => {
    return createLocalScript(payload)
  })

  ipcMain.handle('scriptmanager:runtime:save-script', async (_event, payload: SaveScriptPayload) => {
    return saveLocalScript(payload)
  })

  ipcMain.handle('scriptmanager:runtime:delete-script', async (_event, payload: DeleteScriptPayload) => {
    return deleteLocalScript(payload)
  })

  ipcMain.handle('scriptmanager:runtime:duplicate-script', async (_event, scriptId: string) => {
    return duplicateLocalScript(scriptId)
  })

  ipcMain.handle('scriptmanager:runtime:open-folder', async (_event, payload: OpenFolderPayload) => {
    return openLocalFolder(payload)
  })

  ipcMain.handle('scriptmanager:runtime:list-api-collections', async () => {
    return listDesktopApiCollections()
  })

  ipcMain.handle('scriptmanager:runtime:save-api-collection', async (_event, payload: { id?: string; name: string; description?: string; variables?: string }) => {
    return saveDesktopApiCollection(payload)
  })

  ipcMain.handle('scriptmanager:runtime:delete-api-collection', async (_event, id: string) => {
    return deleteDesktopApiCollection(id)
  })

  ipcMain.handle('scriptmanager:runtime:list-api-requests', async (_event, collectionId: string | null) => {
    return listDesktopApiRequests(collectionId)
  })

  ipcMain.handle('scriptmanager:runtime:save-api-request', async (_event, payload: Record<string, unknown>) => {
    return saveDesktopApiRequest(payload)
  })

  ipcMain.handle('scriptmanager:runtime:delete-api-request', async (_event, id: string) => {
    return deleteDesktopApiRequest(id)
  })

  ipcMain.handle('scriptmanager:runtime:list-api-environments', async () => {
    return listDesktopApiEnvironments()
  })

  ipcMain.handle('scriptmanager:runtime:save-api-environment', async (_event, payload: { id?: string; name: string; variables?: string }) => {
    return saveDesktopApiEnvironment(payload)
  })

  ipcMain.handle('scriptmanager:runtime:delete-api-environment', async (_event, id: string) => {
    return deleteDesktopApiEnvironment(id)
  })

  ipcMain.handle('scriptmanager:runtime:read-api-globals', async () => {
    return readDesktopApiGlobals()
  })

  ipcMain.handle('scriptmanager:runtime:save-api-globals', async (_event, variables: string) => {
    return saveDesktopApiGlobals(variables)
  })

  ipcMain.handle('scriptmanager:runtime:send-api-request', async (_event, payload) => {
    return sendDesktopApiRequest(payload)
  })

  ipcMain.handle('scriptmanager:runtime:list-api-history', async () => {
    return listDesktopApiHistory()
  })

  ipcMain.handle('scriptmanager:runtime:clear-api-history', async () => {
    return clearDesktopApiHistory()
  })

  ipcMain.handle('scriptmanager:runtime:list-api-collection-runs', async () => {
    return listDesktopApiCollectionRuns()
  })

  ipcMain.handle('scriptmanager:runtime:run-api-collection', async (_event, payload: { collectionId: string; environmentId: string | null }) => {
    return runDesktopApiCollection(payload)
  })

  ipcMain.handle('scriptmanager:runtime:list-projects', async () => {
    return listDesktopProjects()
  })

  ipcMain.handle('scriptmanager:runtime:save-project', async (_event, payload: { id?: string; name: string; description?: string; environment?: string; color?: string }) => {
    return saveDesktopProject(payload)
  })

  ipcMain.handle('scriptmanager:runtime:delete-project', async (_event, id: string) => {
    return deleteDesktopProject(id)
  })

  ipcMain.handle('scriptmanager:runtime:assign-collection-project', async (_event, payload: { collectionId: string; projectId: string | null }) => {
    return assignDesktopCollectionToProject(payload.collectionId, payload.projectId)
  })

  ipcMain.handle('scriptmanager:runtime:list-server-profiles', async () => {
    return listDesktopServerProfiles()
  })

  ipcMain.handle('scriptmanager:runtime:save-server-profile', async (_event, payload) => {
    return saveDesktopServerProfile(payload)
  })

  ipcMain.handle('scriptmanager:runtime:delete-server-profile', async (_event, id: string) => {
    return deleteDesktopServerProfile(id)
  })

  ipcMain.handle('scriptmanager:runtime:test-server-profile-connection', async (_event, profileId: string) => {
    return testDesktopConnection(profileId)
  })

  ipcMain.handle('scriptmanager:runtime:transfer-remote-script', async (_event, payload) => {
    return transferDesktopRemoteScript(payload)
  })

  ipcMain.handle('scriptmanager:runtime:start-remote-execution', async (event, payload) => {
    const window = resolveWindow(event)
    const result = await startDesktopRemoteExecution(payload)
    if (!result.requires_approval) {
      forwardRemoteExecutionToWindow(window, result.remote_exec_id)
    }
    return result
  })

  ipcMain.handle('scriptmanager:runtime:approve-remote-execution', async (event, payload: { id: string; approverName: string }) => {
    const window = resolveWindow(event)
    const id = await approveDesktopRemoteExecution(payload.id, payload.approverName)
    forwardRemoteExecutionToWindow(window, id)
    return id
  })

  ipcMain.handle('scriptmanager:runtime:reject-remote-execution', async (_event, id: string) => {
    return rejectDesktopRemoteExecution(id)
  })

  ipcMain.handle('scriptmanager:runtime:list-audit-log', async (_event, payload) => {
    return listDesktopAuditLog(payload ?? undefined)
  })

  ipcMain.handle('scriptmanager:runtime:warm-terminal', async (event) => {
    const window = resolveWindow(event)
    ensureTerminal(window)
    return { ok: true }
  })

  ipcMain.handle('scriptmanager:runtime:terminal-input', async (event, data: string) => {
    const window = resolveWindow(event)
    const terminal = ensureTerminal(window)
    terminal.write(data)
    return { ok: true }
  })

  ipcMain.handle('scriptmanager:runtime:terminal-resize', async (event, payload: { cols: number; rows: number }) => {
    const window = resolveWindow(event)
    const terminal = ensureTerminal(window)
    if (payload.cols > 0 && payload.rows > 0) {
      terminal.resize(payload.cols, payload.rows)
    }
    return { ok: true }
  })

  ipcMain.handle('scriptmanager:runtime:terminal-close', async (event) => {
    const window = resolveWindow(event)
    const runtime = getRuntime(window.id)
    if (runtime.terminal) {
      runtime.terminal.kill()
      runtime.terminal = null
      runtime.terminalShellKind = null
      runtime.terminalContextKey = null
    }
    return { ok: true }
  })

  ipcMain.handle('scriptmanager:runtime:set-terminal-context', async (event, payload: { scriptId: string | null }) => {
    const window = resolveWindow(event)
    const runtime = getRuntime(window.id)

    if (!payload.scriptId) {
      runtime.terminalContextKey = null
      return { ok: true }
    }

    const script = await getScriptRecord(payload.scriptId)
    if (!script) {
      throw new Error('Script not found')
    }

    const context = await getScriptExecutionContext(script)
    applyTerminalContext(window, context)
    return { ok: true }
  })

  ipcMain.handle('scriptmanager:runtime:run-in-terminal', async (event, payload: RunScriptInTerminalPayload) => {
    const window = resolveWindow(event)
    const script = await getScriptRecord(payload.scriptId)
    if (!script) {
      throw new Error('Script not found')
    }

    const context = await getScriptExecutionContext(script)
    const terminal = ensureTerminal(window)
    applyTerminalContext(window, context)
    const command = buildLocalTerminalCommand({
      filePath: resolveScriptPath(script),
      language: script.language,
      interpreter: (script.collection?.pythonToolchainEnabled ? (script.collection.pythonInterpreterPath ?? context.interpreterPath) : null)
        ?? script.interpreter,
      paramValues: payload.paramValues,
    })
    terminal.write(`${command}\r`)
    return { ok: true }
  })

  ipcMain.handle('scriptmanager:runtime:run-script', async (event, payload: RunScriptPayload) => {
    const window = resolveWindow(event)
    return startLocalRun(window, payload)
  })
}
