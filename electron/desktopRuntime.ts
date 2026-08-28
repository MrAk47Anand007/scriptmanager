import { app, BrowserWindow, ipcMain, Notification, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { PrismaClient } from '@prisma/client'
import * as pty from 'node-pty'
import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createApprovalService } from '../src/lib/approvals/service'
import { createPluginRegistry } from '../src/lib/plugins/registry'
import { createTeamAdminService } from '../src/lib/rbac/adminService'
import { createDesktopActorContext } from '../src/lib/runtime/trustedContext'
import { vaultNotificationConfig } from '../src/lib/secrets/notificationConfig'
import { resolveScriptEnvironment } from '../src/lib/secrets/runtime'
import { createSecretVaultService } from '../src/lib/secrets/service'
import { createServerSecretStore } from '../src/lib/secrets/serverStore'
import { notifyWorkflowWorker } from '../src/lib/workflows/workerLoop'
import { createWorkflowRepository } from '../src/lib/workflows/repository'
import { parseWorkflowDefinition } from '../src/lib/workflows/schema'
import { createWorkflowTriggerService } from '../src/lib/workflows/triggers'
import { validateWorkflowGraph } from '../src/lib/workflows/graph'
import { getDesktopWorkspaceLayout, ensureDesktopWorkspaceLayout, sanitizeWorkspaceName } from '../src/lib/workspaceLayout'
import {
  deleteStorageProvider as deleteDesktopStorageProvider,
  listStorageProviders as listDesktopStorageProviders,
  saveStorageProvider as saveDesktopStorageProvider,
  testStorageProvider as testDesktopStorageProvider,
  type SaveStorageProviderPayload,
} from '../src/lib/storage/providerStore'
import { ensureFreshScript, pushScript, syncCollection } from '../src/lib/storage/syncService'
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
import { createOsBackedSecretStore } from './secretStore'
import { createCanonicalFolderWatcher, getCanonicalFolderAvailability, writeCanonicalFile } from './canonicalFolderRuntime'
import { createRecoveryDraftStore } from './recoveryDraftStore'
import { approveRemoteExecution, rejectRemoteExecution } from '../src/lib/ops/remoteExecutionApprovalService'
import {
  assignCollectionToProject as assignDesktopCollectionToProject,
  deleteProject as deleteDesktopProject,
  deleteServerProfile as deleteDesktopServerProfile,
  getRemoteExecEmitter,
  listAuditLog as listDesktopAuditLog,
  listProjects as listDesktopProjects,
  listServerProfiles as listDesktopServerProfiles,
  saveProject as saveDesktopProject,
  saveServerProfile as saveDesktopServerProfile,
  startRemoteExec as startDesktopRemoteExecution,
  testConnection as testDesktopConnection,
  transferScript as transferDesktopRemoteScript,
} from './opsRuntime'
import { scanForScripts, type ScanForScriptsResult } from './scriptScanner'

type TerminalEvent =
  | { sessionId: string; type: 'connected' }
  | { sessionId: string; type: 'data'; data: string }
  | { sessionId: string; type: 'closed' }
  | { sessionId: string; type: 'error'; message: string }

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
  sessionId?: string
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
  parent_id: string | null
  folder_path: string | null
  folder_available: boolean
  folder_last_scanned_at: string | null
  is_temporary: boolean
  runtime_preset: 'general' | 'python' | 'node' | 'shell' | 'powershell'
  python_toolchain_enabled: boolean
  python_venv_path: string | null
  python_interpreter_path: string | null
  storage_provider_id: string | null
  remote_prefix: string | null
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
  parentId?: string | null
  runtimePreset?: CollectionDto['runtime_preset']
  pythonToolchainEnabled?: boolean
}

type UpdateCollectionPayload = {
  id: string
  name?: string
  projectId?: string | null
  parentId?: string | null
  storageProviderId?: string | null
  remotePrefix?: string | null
}

type DeleteCollectionPayload = {
  id: string
  hardDelete?: boolean
}

type ScanPcScriptsPayload = {
  roots: string[]
  extensions: string[]
}

type ImportScannedScriptsPayload = {
  files: { path: string }[]
  mode: 'misc' | 'by-folder'
  rootForGrouping?: string
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
  parentId: string | null
  folderPath: string | null
  folderAvailable: boolean
  folderLastScannedAt: Date | null
  isTemporary: boolean
  runtimePreset: string
  pythonToolchainEnabled: boolean
  pythonVenvPath: string | null
  pythonInterpreterPath: string | null
  storageProviderId?: string | null
  remotePrefix?: string | null
  createdAt: Date
  _count?: { scripts: number }
}

let canonicalFolderWatcher: ReturnType<typeof createCanonicalFolderWatcher> | null = null

function getCanonicalFolderWatcher() {
  canonicalFolderWatcher ??= createCanonicalFolderWatcher({
    onChange: () => undefined,
  })
  return canonicalFolderWatcher
}

export function getDesktopRecoveryDraftStore() {
  return createRecoveryDraftStore({ rootDir: app.getPath('userData') })
}

export function stopCanonicalFolderWatchers() {
  canonicalFolderWatcher?.close()
  canonicalFolderWatcher = null
}

type FolderInspection = {
  hasVenv: boolean
  venvPath: string | null
  interpreterPath: string | null
  manifests: string[]
}

type TerminalShellKind = 'powershell' | 'cmd' | 'posix'

type TerminalSessionRuntime = {
  terminal: pty.IPty
  shellKind: TerminalShellKind
  contextKey: string | null
}

type WindowRuntime = {
  terminalSessions: Map<string, TerminalSessionRuntime>
  pendingTerminalContexts: Map<string, ScriptExecutionContext>
  activeBuilds: Map<string, ReturnType<typeof spawn>>
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

const windowRuntimes = new Map<number, WindowRuntime>()
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_TERMINAL_SESSION_ID = 'terminal-1'
const MAX_SCRIPT_VERSIONS = 10
const SCRIPT_EXTENSIONS = new Set(['.py', '.js', '.ts', '.sh', '.ps1', '.bat'])
const PYTHON_MANIFESTS = ['requirements.txt', 'pyproject.toml', 'Pipfile']
const SAFE_FILENAME_CHARS = /[^a-zA-Z0-9_.-]/g
const SETTINGS_CACHE_TTL_MS = 30_000

let cachedWorkspaceRoot: { value: string; expiresAt: number } | null = null
const desktopWorkflowRepository = createWorkflowRepository(prisma)

function getDesktopSecretVaultService() {
  try {
    return createSecretVaultService(prisma, createOsBackedSecretStore())
  } catch {
    return createSecretVaultService(prisma, createServerSecretStore())
  }
}

async function readSettingsMap(): Promise<Record<string, string>> {
  const settings = await prisma.setting.findMany()
  const result: Record<string, string> = {}

  for (const entry of settings) {
    if (entry.value !== null) {
      result[entry.key] = entry.value
    }
  }

  return result
}

async function saveSettingsMap(nextSettings: Record<string, string>): Promise<Record<string, string>> {
  await prisma.$transaction(
    Object.entries(nextSettings).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: value ?? '' },
        create: { key, value: value ?? '' },
      })
    )
  )

  return readSettingsMap()
}

function serializeWorkflow(workflow: { draftDefinition: string; [key: string]: unknown }) {
  return { ...workflow, definition: JSON.parse(workflow.draftDefinition), draftDefinition: undefined }
}

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
    parent_id: collection.parentId ?? null,
    folder_path: collection.folderPath ?? null,
    folder_available: collection.folderAvailable,
    folder_last_scanned_at: collection.folderLastScannedAt?.toISOString() ?? null,
    is_temporary: collection.isTemporary,
    runtime_preset: normalizeRuntimePreset(collection.runtimePreset),
    python_toolchain_enabled: collection.pythonToolchainEnabled,
    python_venv_path: collection.pythonVenvPath ?? null,
    python_interpreter_path: collection.pythonInterpreterPath ?? null,
    storage_provider_id: collection.storageProviderId ?? null,
    remote_prefix: collection.remotePrefix ?? null,
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

function isPathInside(basePath: string, targetPath: string): boolean {
  const normalizedBase = path.resolve(basePath)
  const normalizedTarget = path.resolve(targetPath)
  const relative = path.relative(normalizedBase, normalizedTarget)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function replacePathPrefix(targetPath: string | null, oldBasePath: string, newBasePath: string): string | null {
  if (!targetPath) {
    return null
  }

  if (!isPathInside(oldBasePath, targetPath)) {
    return targetPath
  }

  const relative = path.relative(path.resolve(oldBasePath), path.resolve(targetPath))
  return path.resolve(newBasePath, relative)
}

function buildCollectionFolderPath(basePath: string, name: string, currentPath?: string | null): string {
  const normalizedCurrentPath = currentPath ? path.resolve(currentPath) : null
  let folderName = sanitizeCollectionFolderName(name)
  let folderPath = path.join(basePath, folderName)
  let suffix = 2

  while (fs.existsSync(folderPath) && path.resolve(folderPath) !== normalizedCurrentPath) {
    folderName = `${sanitizeCollectionFolderName(name)}_${suffix++}`
    folderPath = path.join(basePath, folderName)
  }

  return folderPath
}

async function getCollectionSubtree(rootCollectionId: string): Promise<CollectionRecord[]> {
  const collections = await prisma.collection.findMany({
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { scripts: true } } },
  })

  const root = collections.find((collection) => collection.id === rootCollectionId)
  if (!root) {
    throw new Error('Collection not found')
  }

  const childrenByParentId = new Map<string | null, CollectionRecord[]>()
  for (const collection of collections) {
    const siblings = childrenByParentId.get(collection.parentId ?? null) ?? []
    siblings.push(collection)
    childrenByParentId.set(collection.parentId ?? null, siblings)
  }

  const subtree: CollectionRecord[] = []
  const stack: CollectionRecord[] = [root]
  while (stack.length > 0) {
    const current = stack.pop()!
    subtree.push(current)
    const children = childrenByParentId.get(current.id) ?? []
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!)
    }
  }

  return subtree
}

async function getCollectionParentRecord(parentId: string | null | undefined): Promise<CollectionRecord | null> {
  if (!parentId) {
    return null
  }

  return prisma.collection.findUnique({
    where: { id: parentId },
    include: { _count: { select: { scripts: true } } },
  })
}

function toAbsolutePath(targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath)
}

function getDefaultTerminalCwd(): string {
  try {
    return os.homedir()
  } catch {
    return process.cwd()
  }
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
      terminalSessions: new Map(),
      pendingTerminalContexts: new Map(),
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

function normalizeTerminalSessionId(sessionId?: string | null): string {
  const trimmed = sessionId?.trim()
  return trimmed || DEFAULT_TERMINAL_SESSION_ID
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

function getShellPromptKick(shellKind: TerminalShellKind): string {
  return shellKind === 'posix' ? '\n' : '\r'
}

function createTerminalForWindow(window: BrowserWindow, sessionId: string): TerminalSessionRuntime {
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
        cwd: getDefaultTerminalCwd(),
        env: env as { [key: string]: string },
        useConpty: false,
      })
      const runtime = getRuntime(window.id)
      const sessionRuntime: TerminalSessionRuntime = {
        terminal,
        shellKind: candidate.kind,
        contextKey: null,
      }
      let receivedInitialData = false
      const promptKickTimer = setTimeout(() => {
        const currentRuntime = getRuntime(window.id)
        const currentSession = currentRuntime.terminalSessions.get(sessionId)
        if (!receivedInitialData && currentSession?.terminal === terminal) {
          try {
            terminal.write(getShellPromptKick(candidate.kind))
          } catch {}
        }
      }, 900)

      terminal.onData((data) => {
        receivedInitialData = true
        sendTerminalEvent(window.webContents, { sessionId, type: 'data', data })
      })

      terminal.onExit(() => {
        clearTimeout(promptKickTimer)
        const runtime = getRuntime(window.id)
        const existing = runtime.terminalSessions.get(sessionId)
        if (existing?.terminal === terminal) {
          runtime.terminalSessions.delete(sessionId)
        }
        sendTerminalEvent(window.webContents, { sessionId, type: 'closed' })
      })

      runtime.terminalSessions.set(sessionId, sessionRuntime)
      const pendingContext = runtime.pendingTerminalContexts.get(sessionId)
      if (pendingContext) {
        sessionRuntime.contextKey = pendingContext.key
        sessionRuntime.terminal.write(buildTerminalContextCommands(pendingContext.cwd, pendingContext.venvPath, sessionRuntime.shellKind))
        runtime.pendingTerminalContexts.delete(sessionId)
      }
      sendTerminalEvent(window.webContents, { sessionId, type: 'connected' })
      return sessionRuntime
    } catch (error) {
      lastError = error
      console.warn(`[DesktopRuntime] Failed to spawn ${candidate.shell}, trying fallback`, error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to start terminal shell')
}

function ensureTerminal(window: BrowserWindow, sessionId = DEFAULT_TERMINAL_SESSION_ID): TerminalSessionRuntime {
  const runtime = getRuntime(window.id)
  const normalizedSessionId = normalizeTerminalSessionId(sessionId)
  const existing = runtime.terminalSessions.get(normalizedSessionId)
  if (existing) {
    return existing
  }

  return createTerminalForWindow(window, normalizedSessionId)
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

function applyTerminalContext(window: BrowserWindow, sessionId: string, context: ScriptExecutionContext, force = false) {
  const session = ensureTerminal(window, sessionId)
  if (!force && session.contextKey === context.key) {
    return
  }

  session.contextKey = context.key
  session.terminal.write(buildTerminalContextCommands(context.cwd, context.venvPath, session.shellKind))
}

function releaseWorkspaceFromTerminal(folderPath: string) {
  const normalizedFolder = path.resolve(folderPath)
  for (const runtime of windowRuntimes.values()) {
    for (const [sessionId, session] of runtime.terminalSessions.entries()) {
      const activeContext = session.contextKey?.split('::')[0]
      if (activeContext && isPathInside(normalizedFolder, activeContext)) {
        try {
          session.terminal.kill()
        } catch {}
        runtime.terminalSessions.delete(sessionId)
      }
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

  await Promise.all(collections.map(async (collection) => {
    if (!collection.folderPath) return
    const availability = await getCanonicalFolderAvailability(collection.folderPath, collection.id)
    if (collection.folderAvailable !== availability.available) {
      await prisma.collection.update({
        where: { id: collection.id },
        data: { folderAvailable: availability.available, folderLastScannedAt: new Date(availability.checkedAt) },
      })
      collection.folderAvailable = availability.available
      collection.folderLastScannedAt = new Date(availability.checkedAt)
    }
    if (availability.available) getCanonicalFolderWatcher().watch(collection.id, collection.folderPath)
    else getCanonicalFolderWatcher().unwatch(collection.id)
  }))

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

  const parentCollection = await getCollectionParentRecord(payload.parentId)
  if (payload.parentId && !parentCollection) {
    throw new Error('Parent collection not found')
  }

  const baseFolderPath = parentCollection?.folderPath
    ? path.resolve(parentCollection.folderPath)
    : workspaceRoot
  const folderPath = buildCollectionFolderPath(baseFolderPath, name)

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
      projectId: payload.projectId !== undefined ? payload.projectId : (parentCollection?.projectId ?? null),
      parentId: payload.parentId ?? null,
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

async function updateLocalCollection(payload: UpdateCollectionPayload): Promise<{ updatedCollections: CollectionDto[] }> {
  const collection = await getCollectionRecord(payload.id)
  if (!collection) {
    throw new Error('Collection not found')
  }

  if (payload.storageProviderId) {
    const provider = await prisma.storageProvider.findUnique({ where: { id: payload.storageProviderId } })
    if (!provider) {
      throw new Error('Storage provider not found')
    }
  }

  const subtree = await getCollectionSubtree(collection.id)
  const descendantIds = new Set(subtree.slice(1).map((entry) => entry.id))
  if (payload.parentId && descendantIds.has(payload.parentId)) {
    throw new Error('A collection cannot be moved inside one of its descendants')
  }

  if (payload.parentId && payload.parentId === collection.id) {
    throw new Error('A collection cannot be its own parent')
  }

  const parentCollection = await getCollectionParentRecord(
    payload.parentId !== undefined ? payload.parentId : collection.parentId,
  )
  if ((payload.parentId !== undefined ? payload.parentId : collection.parentId) && !parentCollection) {
    throw new Error('Parent collection not found')
  }

  const nextName = payload.name?.trim() || collection.name
  const nextProjectId = payload.projectId !== undefined
    ? payload.projectId ?? null
    : (parentCollection?.projectId ?? collection.projectId ?? null)
  const nextParentId = payload.parentId !== undefined ? (payload.parentId || null) : collection.parentId
  const oldRootFolderPath = collection.folderPath ? path.resolve(collection.folderPath) : null
  const destinationBasePath = parentCollection?.folderPath
    ? path.resolve(parentCollection.folderPath)
    : await getWorkspaceRoot()
  const nextRootFolderPath = oldRootFolderPath
    ? buildCollectionFolderPath(destinationBasePath, nextName, oldRootFolderPath)
    : null

  if (oldRootFolderPath && nextRootFolderPath && oldRootFolderPath !== nextRootFolderPath) {
    fs.mkdirSync(path.dirname(nextRootFolderPath), { recursive: true })
    if (fs.existsSync(oldRootFolderPath)) {
      fs.renameSync(oldRootFolderPath, nextRootFolderPath)
    } else {
      fs.mkdirSync(nextRootFolderPath, { recursive: true })
    }
  }

  const subtreeCollectionIds = subtree.map((entry) => entry.id)
  const scriptsWithSourcePaths = oldRootFolderPath
    ? await prisma.script.findMany({
      where: {
        collectionId: { in: subtreeCollectionIds },
        sourcePath: { not: null },
      },
      select: {
        id: true,
        sourcePath: true,
      },
    })
    : []

  const updatedCollections = await prisma.$transaction(async (tx) => {
    const records: CollectionRecord[] = []

    for (const entry of subtree) {
      const isRoot = entry.id === collection.id
      const updated = await tx.collection.update({
        where: { id: entry.id },
        data: {
          name: isRoot ? nextName : entry.name,
          projectId: nextProjectId,
          parentId: isRoot ? nextParentId : entry.parentId,
          folderPath: oldRootFolderPath && nextRootFolderPath
            ? replacePathPrefix(entry.folderPath, oldRootFolderPath, nextRootFolderPath)
            : entry.folderPath,
          pythonVenvPath: oldRootFolderPath && nextRootFolderPath
            ? replacePathPrefix(entry.pythonVenvPath, oldRootFolderPath, nextRootFolderPath)
            : entry.pythonVenvPath,
          pythonInterpreterPath: oldRootFolderPath && nextRootFolderPath
            ? replacePathPrefix(entry.pythonInterpreterPath, oldRootFolderPath, nextRootFolderPath)
            : entry.pythonInterpreterPath,
          // Cloud binding only changes on the root collection of the update
          ...(isRoot && payload.storageProviderId !== undefined
            ? { storageProviderId: payload.storageProviderId || null }
            : {}),
          ...(isRoot && payload.remotePrefix !== undefined
            ? { remotePrefix: payload.remotePrefix || null }
            : {}),
        },
        include: { _count: { select: { scripts: true } } },
      })
      records.push(updated)
    }

    if (oldRootFolderPath && nextRootFolderPath) {
      for (const script of scriptsWithSourcePaths) {
        await tx.script.update({
          where: { id: script.id },
          data: {
            sourcePath: replacePathPrefix(script.sourcePath, oldRootFolderPath, nextRootFolderPath),
          },
        })
      }
    }

    return records
  })

  return {
    updatedCollections: updatedCollections.map(serializeCollectionRecord),
  }
}

async function deleteLocalCollection(payload: DeleteCollectionPayload): Promise<{
  id: string
  deletedCollectionIds: string[]
  deletedScriptIds: string[]
  deletedFolderPath: string | null
}> {
  const subtree = await getCollectionSubtree(payload.id)
  const collection = subtree[0]
  const subtreeCollectionIds = subtree.map((entry) => entry.id)
  const deletedScripts = await prisma.script.findMany({
    where: { collectionId: { in: subtreeCollectionIds } },
    select: { id: true },
  })
  const deletedScriptIds = deletedScripts.map((script) => script.id)
  const hardDelete = Boolean(payload.hardDelete)
  const parentCollection = await getCollectionParentRecord(collection.parentId)
  const managedWorkspace = await isManagedCollectionWorkspace(collection.folderPath)
  const ownedSubfolder = Boolean(
    collection.folderPath &&
    parentCollection?.folderPath &&
    isPathInside(parentCollection.folderPath, collection.folderPath),
  )
  const shouldDeleteWorkspace = Boolean(collection.folderPath) &&
    (managedWorkspace || ownedSubfolder) &&
    (hardDelete || !collection.isTemporary)

  if (hardDelete || shouldDeleteWorkspace) {
    await prisma.$transaction(async (tx) => {
      if (deletedScriptIds.length > 0) {
        await tx.script.deleteMany({
          where: { collectionId: { in: subtreeCollectionIds } },
        })
      }

      await tx.collection.deleteMany({
        where: { id: { in: subtreeCollectionIds } },
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
      deletedCollectionIds: subtreeCollectionIds,
      deletedScriptIds,
      deletedFolderPath: shouldDeleteWorkspace ? path.resolve(collection.folderPath!) : null,
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.script.updateMany({
      where: { collectionId: { in: subtreeCollectionIds } },
      data: { collectionId: null },
    })

    await tx.collection.deleteMany({
      where: { id: { in: subtreeCollectionIds } },
    })
  })

  return {
    id: collection.id,
    deletedCollectionIds: subtreeCollectionIds,
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
  if (script.sourcePath && script.collection?.folderPath) {
    await writeCanonicalFile(script.collection.folderPath, filePath, payload.content)
  } else {
    // The managed workspace may not exist yet after a fresh checkout.
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, payload.content, 'utf8')
  }
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

  // Push-on-save: fire-and-forget upload for cloud-bound collections.
  void pushScript(prisma, script.id, getScriptsDir()).then((result) => {
    if (result.pushed) {
      console.log(`[CloudSync] pushed ${script.filename} after save`)
    } else if (result.error) {
      console.warn(`[CloudSync] push after save failed for ${script.filename}: ${result.error}`)
    }
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
  while (await prisma.script.findFirst({ where: { name: newName } })) {
    newName = `${baseName} ${counter++}`
  }

  const ext = original.filename.includes('.') ? `.${original.filename.split('.').pop()}` : '.py'
  const newFilename = sanitizeScriptFilename(newName, ext)
  const newPath = path.join(original.collection?.folderPath ? path.resolve(original.collection.folderPath) : await getWorkspaceRoot(), newFilename)

  if (fs.existsSync(newPath)) {
    throw new Error('A file with the duplicate name already exists')
  }

  fs.mkdirSync(path.dirname(newPath), { recursive: true })
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
    const existing = await prisma.script.findFirst({ where: { name: candidate } })
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
        folderAvailable: true,
        folderLastScannedAt: new Date(),
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
        folderAvailable: true,
        folderLastScannedAt: new Date(),
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

// --- Find scripts on this PC (scan + import as linked scripts) ---

async function scanPcScripts(payload: ScanPcScriptsPayload): Promise<ScanForScriptsResult> {
  const roots = (payload.roots ?? []).map((root) => String(root).trim()).filter(Boolean)
  if (roots.length === 0) {
    throw new Error('At least one folder is required')
  }

  for (const root of roots) {
    if (!path.isAbsolute(root)) {
      throw new Error(`Folder path must be absolute: ${root}`)
    }
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new Error(`Folder does not exist: ${root}`)
    }
  }

  const extensions = (payload.extensions ?? []).filter((ext) => typeof ext === 'string' && ext.trim())
  if (extensions.length === 0) {
    throw new Error('At least one extension is required')
  }

  return scanForScripts({ roots, extensions })
}

function normalizeSourcePathKey(sourcePath: string): string {
  const resolved = path.resolve(sourcePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** Group name for 'by-folder' mode: top-level segment under the scan root, falling back to the parent dir name. */
function scannedScriptGroupName(filePath: string, rootForGrouping?: string): string {
  if (rootForGrouping) {
    const relative = path.relative(path.resolve(rootForGrouping), path.resolve(filePath))
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      const segments = relative.split(/[\\/]/).filter(Boolean)
      if (segments.length > 1) {
        return segments[0]!
      }
      return path.basename(path.resolve(rootForGrouping)) || 'Miscellaneous'
    }
  }
  return path.basename(path.dirname(path.resolve(filePath))) || 'Miscellaneous'
}

/** Find-or-create a plain DB collection (no folderPath) by name. */
async function findOrCreatePlainCollection(name: string, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(name)
  if (cached) {
    return cached
  }

  const existing = await prisma.collection.findFirst({ where: { name } })
  if (existing) {
    cache.set(name, existing.id)
    return existing.id
  }

  const created = await prisma.collection.create({
    data: {
      name,
      description: '',
      isTemporary: false,
    },
  })
  cache.set(name, created.id)
  return created.id
}

async function importScannedScripts(payload: ImportScannedScriptsPayload): Promise<{
  imported: number
  skipped: number
  collections: string[]
}> {
  const requested = (payload.files ?? [])
    .map((file) => String(file?.path ?? '').trim())
    .filter(Boolean)

  if (requested.length === 0) {
    return { imported: 0, skipped: 0, collections: [] }
  }

  // Skip files already linked (compare sourcePath case-insensitively on Windows).
  const existingScripts = await prisma.script.findMany({
    where: { sourcePath: { not: null } },
    select: { sourcePath: true },
  })
  const existingSourceKeys = new Set(
    existingScripts
      .map((script) => script.sourcePath)
      .filter((sourcePath): sourcePath is string => Boolean(sourcePath))
      .map(normalizeSourcePathKey),
  )

  const collectionCache = new Map<string, string>()
  const usedCollectionNames = new Set<string>()
  const seenInBatch = new Set<string>()
  let imported = 0
  let skipped = 0

  for (const rawPath of requested) {
    const absolutePath = path.resolve(rawPath)
    const key = normalizeSourcePathKey(absolutePath)
    if (existingSourceKeys.has(key) || seenInBatch.has(key)) {
      skipped += 1
      continue
    }
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      skipped += 1
      continue
    }
    seenInBatch.add(key)

    const collectionName = payload.mode === 'by-folder'
      ? scannedScriptGroupName(absolutePath, payload.rootForGrouping)
      : 'Miscellaneous'
    const collectionId = await findOrCreatePlainCollection(collectionName, collectionCache)
    usedCollectionNames.add(collectionName)

    const filename = path.basename(absolutePath)
    const baseName = path.basename(absolutePath, path.extname(absolutePath)) || filename

    // Dedupe the display name with a numeric suffix, mirroring duplicateScript.
    let name = baseName
    let counter = 2
    while (await prisma.script.findFirst({ where: { name } })) {
      name = `${baseName} ${counter++}`
    }

    await prisma.script.create({
      data: {
        name,
        filename,
        sourcePath: absolutePath,
        language: inferScriptLanguage(absolutePath),
        parameters: '[]',
        webhookToken: crypto.randomUUID().replace(/-/g, ''),
        collectionId,
      },
    })
    imported += 1
  }

  return { imported, skipped, collections: Array.from(usedCollectionNames) }
}

// --- Native build notifications + last-run tracking (used by the tray in main.ts) ---

let notificationsEnabled = true
let lastRunScriptId: string | null = null
let lastRunScriptListener: ((scriptId: string) => void) | null = null

export function setDesktopNotificationsEnabled(enabled: boolean) {
  notificationsEnabled = enabled
}

export function getLastRunScriptId(): string | null {
  return lastRunScriptId
}

export function setLastRunScriptListener(listener: ((scriptId: string) => void) | null) {
  lastRunScriptListener = listener
}

export function runScriptForWindow(window: BrowserWindow, scriptId: string) {
  return startLocalRun(window, { scriptId })
}

function recordLastRunScript(scriptId: string) {
  lastRunScriptId = scriptId
  lastRunScriptListener?.(scriptId)
}

function notifyBuildResult(
  window: BrowserWindow,
  options: { success: boolean; scriptName: string; durationMs?: number; detail?: string },
) {
  if (!notificationsEnabled || !Notification.isSupported()) {
    return
  }
  if (window.isDestroyed() || window.isFocused()) {
    return
  }

  const parts = [options.scriptName]
  if (typeof options.durationMs === 'number') {
    parts.push(`${(options.durationMs / 1000).toFixed(1)}s`)
  }
  if (options.detail) {
    parts.push(options.detail)
  }

  const notification = new Notification({
    title: options.success ? 'Script succeeded' : 'Script failed',
    body: parts.join(' · '),
  })
  notification.on('click', () => {
    if (window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })
  notification.show()
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

  recordLastRunScript(script.id)
  const runStartedAt = Date.now()
  const buildId = payload.buildId?.trim() || crypto.randomUUID()
  const logFile = getBuildLogPath(script.filename, buildId)

  // Pull-on-run: refresh cloud-bound scripts before executing; remote failures
  // degrade to the cached local copy (warning surfaced in the build output).
  const freshness = await ensureFreshScript(prisma, script.id, getScriptsDir())

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

  if (freshness.pulled) {
    sendBuildEvent(window.webContents, { type: 'line', buildId, line: '[cloud] pulled latest version from storage provider\n' })
  } else if (freshness.warning) {
    sendBuildEvent(window.webContents, { type: 'line', buildId, line: `[cloud] ${freshness.warning}\n` })
  }

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
    notifyBuildResult(window, { success: false, scriptName: script.name, detail: 'script file not found' })
    return { buildId, status: 'failed' as const }
  }

  const [cmd, args] = resolveInterpreter(
    script.language,
    (script.collection?.pythonToolchainEnabled ? (script.collection.pythonInterpreterPath ?? executionContext.interpreterPath) : null)
      ?? script.interpreter,
    scriptPath,
  )
  const runtime = getRuntime(window.id)
  const scriptEnv = await resolveScriptEnvironment(prisma, script.id, envVars)

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
    notifyBuildResult(window, {
      success: false,
      scriptName: script.name,
      durationMs: Date.now() - runStartedAt,
      detail: error.message,
    })
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
    notifyBuildResult(window, {
      success: status === 'success',
      scriptName: script.name,
      durationMs: Date.now() - runStartedAt,
      detail: status === 'timeout' ? 'timed out' : undefined,
    })
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

  for (const session of runtime.terminalSessions.values()) {
    try {
      session.terminal.kill()
    } catch {}
  }

  for (const child of runtime.activeBuilds.values()) {
    try {
      child.kill('SIGTERM')
    } catch {}
  }

  runtime.activeBuilds.clear()
  runtime.terminalSessions.clear()
  windowRuntimes.delete(windowId)
}

async function getDesktopBootstrapState() {
  const [scripts, collections, settings] = await Promise.all([
    listScripts(),
    listCollections(),
    readSettingsMap(),
  ])

  return { scripts, collections, settings }
}

async function listWorkspaceAccessState() {
  const actor = await createDesktopActorContext(prisma)
  const service = createTeamAdminService(prisma)
  const [workspace, members, roles, invitations, sessions, audit] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: actor.workspaceId } }),
    service.listMembers(actor.workspaceId),
    service.listRoles(actor.workspaceId),
    service.listInvitations(actor.workspaceId),
    service.listSessions(actor.workspaceId),
    service.listAudit(actor.workspaceId),
  ])

  return {
    workspace,
    members,
    roles,
    invitations,
    currentUserId: actor.actorId,
    permissions: actor.permissions,
    sessions,
    audit,
  }
}

async function createWorkflowDraftForDesktop(payload: {
  name: string
  description?: string
  definition: unknown
  projectId?: string | null
}) {
  const actor = await createDesktopActorContext(prisma)
  const workflow = await desktopWorkflowRepository.createDraft({
    name: payload.name,
    description: payload.description,
    definition: parseWorkflowDefinition(payload.definition),
    projectId: payload.projectId,
    workspaceId: actor.workspaceId,
  })
  return serializeWorkflow(workflow)
}

async function saveWorkflowDraftForDesktop(payload: {
  id: string
  definition: unknown
  projectId?: string | null
}) {
  const updated = await desktopWorkflowRepository.updateDraft(
    payload.id,
    parseWorkflowDefinition(payload.definition)
  )

  if (payload.projectId !== undefined) {
    await desktopWorkflowRepository.setProject(payload.id, payload.projectId)
  }

  return serializeWorkflow({
    ...updated,
    projectId: payload.projectId ?? updated.projectId,
  })
}

async function publishWorkflowForDesktop(id: string) {
  const stored = await desktopWorkflowRepository.getWorkflow(id)
  if (!stored) {
    throw new Error('Workflow not found')
  }

  const issues = validateWorkflowGraph(parseWorkflowDefinition(JSON.parse(stored.draftDefinition)))
  if (issues.length) {
    throw new Error('Workflow is invalid')
  }

  return desktopWorkflowRepository.publish(id)
}

async function runWorkflowForDesktop(payload: { id: string; input?: unknown }) {
  const actor = await createDesktopActorContext(prisma)
  const workflow = await desktopWorkflowRepository.getWorkflow(payload.id)
  if (!workflow?.publishedVersion) {
    throw new Error('Publish the workflow before running it')
  }

  const version = workflow.versions.find((item) => item.version === workflow.publishedVersion)
  if (!version) {
    throw new Error('Published workflow version not found')
  }

  const run = await createWorkflowTriggerService(desktopWorkflowRepository).manual({
    workflowId: payload.id,
    versionId: version.id,
    actorId: actor.actorId,
    payload: payload.input ?? {},
  })

  notifyWorkflowWorker()
  return run
}

export function attachDesktopRuntime(window: BrowserWindow) {
  const handleClosed = () => destroyWindowRuntime(window.id)
  window.once('closed', handleClosed)
}

export function warmWindowDesktopRuntime(window: BrowserWindow) {
  try {
    ensureTerminal(window, DEFAULT_TERMINAL_SESSION_ID)
  } catch (error) {
    console.error('[DesktopRuntime] Failed to warm terminal runtime:', error)
  }
}

export function initDesktopRuntimeIpc() {
  ipcMain.handle('scriptmanager:runtime:get-bootstrap-state', async () => {
    return getDesktopBootstrapState()
  })

  ipcMain.handle('scriptmanager:runtime:read-settings', async () => {
    return readSettingsMap()
  })

  ipcMain.handle('scriptmanager:runtime:save-settings', async (_event, settings: Record<string, string>) => {
    return saveSettingsMap(settings)
  })

  ipcMain.handle('scriptmanager:runtime:list-secrets', async () => {
    const actor = await createDesktopActorContext(prisma)
    return getDesktopSecretVaultService().listSecrets(actor.workspaceId)
  })

  ipcMain.handle('scriptmanager:runtime:create-secret', async (_event, payload: { name: string; plaintext: string; description?: string; scope?: string }) => {
    const actor = await createDesktopActorContext(prisma)
    return getDesktopSecretVaultService().createSecret({ ...payload, workspaceId: actor.workspaceId, createdBy: actor.actorId })
  })

  ipcMain.handle('scriptmanager:runtime:rotate-secret', async (_event, payload: { id: string; plaintext?: string; resource?: string; reason?: string }) => {
    if (!payload.plaintext) throw new Error('Secret value is required')
    const actor = await createDesktopActorContext(prisma)
    return getDesktopSecretVaultService().rotateSecret(payload.id, payload.plaintext, {
      actorType: 'user', actorId: actor.actorId, workspaceId: actor.workspaceId, capability: 'secret:manage', resource: payload.resource ?? 'desktop', reason: payload.reason ?? '',
    })
  })

  ipcMain.handle('scriptmanager:runtime:disable-secret', async (_event, payload: { id: string; resource?: string; reason?: string }) => {
    const actor = await createDesktopActorContext(prisma)
    return getDesktopSecretVaultService().disableSecret(payload.id, {
      actorType: 'user', actorId: actor.actorId, workspaceId: actor.workspaceId, capability: 'secret:manage', resource: payload.resource ?? 'desktop', reason: payload.reason ?? '',
    })
  })

  ipcMain.handle('scriptmanager:runtime:list-approvals', async (_event, status?: string) => {
    await createDesktopActorContext(prisma)
    return createApprovalService(prisma).list(status)
  })

  ipcMain.handle('scriptmanager:runtime:decide-approval', async (_event, payload: { id: string; decision: 'allow_once' | 'allow_run' | 'allow_workspace' | 'reject'; note?: string }) => {
    const actor = await createDesktopActorContext(prisma)
    return createApprovalService(prisma).decide({ requestId: payload.id, decision: payload.decision, actor, note: payload.note })
  })

  ipcMain.handle('scriptmanager:runtime:list-workspace-access', async () => {
    return listWorkspaceAccessState()
  })

  ipcMain.handle('scriptmanager:runtime:create-workspace-invitation', async (_event, payload: { email: string; roleId: string }) => {
    const actor = await createDesktopActorContext(prisma)
    return createTeamAdminService(prisma).invite({ workspaceId: actor.workspaceId, email: payload.email, roleId: payload.roleId, invitedById: actor.actorId })
  })

  ipcMain.handle('scriptmanager:runtime:revoke-workspace-grants', async (_event, payload: { actorId?: string }) => {
    const actor = await createDesktopActorContext(prisma)
    return createTeamAdminService(prisma).revokeGrants(actor.workspaceId, payload.actorId)
  })

  ipcMain.handle('scriptmanager:runtime:create-workspace-role', async (_event, payload: { name: string; description?: string; permissions: string[] }) => {
    const actor = await createDesktopActorContext(prisma)
    return createTeamAdminService(prisma).createRole(actor.workspaceId, actor.actorId, payload)
  })

  ipcMain.handle('scriptmanager:runtime:list-workflows', async () => {
    const actor = await createDesktopActorContext(prisma)
    return (await desktopWorkflowRepository.listWorkflows(actor.workspaceId)).map(serializeWorkflow)
  })

  ipcMain.handle('scriptmanager:runtime:create-workflow', async (_event, payload) => {
    return createWorkflowDraftForDesktop(payload)
  })

  ipcMain.handle('scriptmanager:runtime:save-workflow', async (_event, payload) => {
    return saveWorkflowDraftForDesktop(payload)
  })

  ipcMain.handle('scriptmanager:runtime:publish-workflow', async (_event, id: string) => {
    return publishWorkflowForDesktop(id)
  })

  ipcMain.handle('scriptmanager:runtime:run-workflow', async (_event, payload: { id: string; input?: unknown }) => {
    return runWorkflowForDesktop(payload)
  })

  ipcMain.handle('scriptmanager:runtime:list-workflow-runs', async (_event, workflowId: string) => {
    return desktopWorkflowRepository.listRuns(workflowId)
  })

  ipcMain.handle('scriptmanager:runtime:read-workflow-run', async (_event, runId: string) => {
    return desktopWorkflowRepository.getRun(runId)
  })

  ipcMain.handle('scriptmanager:runtime:retry-workflow-node', async (_event, payload: { runId: string; nodeId: string }) => {
    return desktopWorkflowRepository.retryNode(payload.runId, payload.nodeId)
  })

  ipcMain.handle('scriptmanager:runtime:cancel-workflow-run', async (_event, runId: string) => {
    return desktopWorkflowRepository.requestCancellation(runId)
  })

  ipcMain.handle('scriptmanager:runtime:list-notification-channels', async () => {
    return prisma.notificationChannel.findMany({ include: { _count: { select: { rules: true, deliveries: true } } }, orderBy: { createdAt: 'desc' } })
  })

  ipcMain.handle('scriptmanager:runtime:create-notification-channel', async (_event, payload: { name: string; kind: string; config?: unknown }) => {
    if (!['desktop', 'webhook', 'slack', 'smtp', 'teams'].includes(payload.kind)) throw new Error('Invalid channel')
    const id = crypto.randomUUID()
    const config = await vaultNotificationConfig(prisma, id, payload.config)
    return prisma.notificationChannel.create({ data: { id, name: payload.name, kind: payload.kind, configJson: JSON.stringify(config) } })
  })

  ipcMain.handle('scriptmanager:runtime:list-plugins', async () => {
    const actor = await createDesktopActorContext(prisma)
    return createPluginRegistry(prisma).list(actor.workspaceId)
  })

  ipcMain.handle('scriptmanager:runtime:update-plugin', async (_event, payload: { id: string; action: string; healthy?: boolean; message?: string; settings?: unknown }) => {
    const actor = await createDesktopActorContext(prisma)
    const registry = createPluginRegistry(prisma)
    const result = payload.action === 'trust' ? await registry.trust(actor.workspaceId, payload.id)
      : payload.action === 'enable' ? await registry.enable(actor.workspaceId, payload.id)
        : payload.action === 'disable' ? await registry.disable(actor.workspaceId, payload.id)
          : payload.action === 'health' ? await registry.setHealth(actor.workspaceId, payload.id, Boolean(payload.healthy), payload.message)
            : payload.action === 'settings' ? await registry.updateSettings(actor.workspaceId, payload.id, payload.settings)
              : null
    if (!result) throw new Error('Unsupported plugin action')
    return result
  })

  ipcMain.handle('scriptmanager:runtime:remove-plugin', async (_event, id: string) => {
    const actor = await createDesktopActorContext(prisma)
    await createPluginRegistry(prisma).uninstall(actor.workspaceId, id)
  })

  ipcMain.handle('scriptmanager:runtime:list-scripts', async () => {
    return listScripts()
  })

  ipcMain.handle('scriptmanager:runtime:list-collections', async () => {
    return listCollections()
  })

  ipcMain.handle('scriptmanager:runtime:create-collection', async (_event, payload: CreateCollectionPayload) => {
    return createLocalCollection(payload)
  })

  ipcMain.handle('scriptmanager:runtime:update-collection', async (_event, payload: UpdateCollectionPayload) => {
    return updateLocalCollection(payload)
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

  ipcMain.handle('scriptmanager:runtime:scan-pc-scripts', async (_event, payload: ScanPcScriptsPayload) => {
    return scanPcScripts(payload)
  })

  ipcMain.handle('scriptmanager:runtime:import-scanned-scripts', async (_event, payload: ImportScannedScriptsPayload) => {
    return importScannedScripts(payload)
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

  ipcMain.handle('scriptmanager:runtime:approve-remote-execution', async (event, payload: { id: string; note?: string }) => {
    const window = resolveWindow(event)
    const actor = await createDesktopActorContext(prisma)
    const result = await approveRemoteExecution(payload.id, actor, crypto.randomUUID())
    forwardRemoteExecutionToWindow(window, result.remoteExecId)
    return result
  })

  ipcMain.handle('scriptmanager:runtime:reject-remote-execution', async (_event, id: string) => {
    const actor = await createDesktopActorContext(prisma)
    return rejectRemoteExecution(id, actor)
  })

  ipcMain.handle('scriptmanager:runtime:list-audit-log', async (_event, payload) => {
    return listDesktopAuditLog(payload ?? undefined)
  })

  ipcMain.handle('scriptmanager:runtime:list-storage-providers', async () => {
    return listDesktopStorageProviders(prisma)
  })

  ipcMain.handle('scriptmanager:runtime:save-storage-provider', async (_event, payload: SaveStorageProviderPayload) => {
    return saveDesktopStorageProvider(prisma, payload)
  })

  ipcMain.handle('scriptmanager:runtime:delete-storage-provider', async (_event, id: string) => {
    return deleteDesktopStorageProvider(prisma, id)
  })

  ipcMain.handle('scriptmanager:runtime:test-storage-provider', async (_event, id: string) => {
    return testDesktopStorageProvider(prisma, id)
  })

  ipcMain.handle('scriptmanager:runtime:sync-collection', async (_event, collectionId: string) => {
    return syncCollection(prisma, collectionId, getScriptsDir())
  })

  ipcMain.handle('scriptmanager:runtime:warm-terminal', async (event, payload?: { sessionId?: string }) => {
    const window = resolveWindow(event)
    ensureTerminal(window, normalizeTerminalSessionId(payload?.sessionId))
    return { ok: true }
  })

  ipcMain.handle('scriptmanager:runtime:terminal-input', async (event, payload: { sessionId?: string; data: string }) => {
    const window = resolveWindow(event)
    const terminal = ensureTerminal(window, normalizeTerminalSessionId(payload.sessionId))
    terminal.terminal.write(payload.data)
    return { ok: true }
  })

  ipcMain.handle('scriptmanager:runtime:terminal-resize', async (event, payload: { sessionId?: string; cols: number; rows: number }) => {
    const window = resolveWindow(event)
    const terminal = ensureTerminal(window, normalizeTerminalSessionId(payload.sessionId))
    if (payload.cols > 0 && payload.rows > 0) {
      terminal.terminal.resize(payload.cols, payload.rows)
    }
    return { ok: true }
  })

  ipcMain.handle('scriptmanager:runtime:terminal-close', async (event, payload?: { sessionId?: string }) => {
    const window = resolveWindow(event)
    const runtime = getRuntime(window.id)
    const sessionId = normalizeTerminalSessionId(payload?.sessionId)
    const session = runtime.terminalSessions.get(sessionId)
    if (session) {
      session.terminal.kill()
      runtime.terminalSessions.delete(sessionId)
    }
    return { ok: true }
  })

  ipcMain.handle('scriptmanager:runtime:set-terminal-context', async (event, payload: { sessionId?: string; scriptId: string | null }) => {
    const window = resolveWindow(event)
    const runtime = getRuntime(window.id)
    const sessionId = normalizeTerminalSessionId(payload.sessionId)
    const session = runtime.terminalSessions.get(sessionId)

    if (!payload.scriptId) {
      runtime.pendingTerminalContexts.delete(sessionId)
      if (session) {
        session.contextKey = null
      }
      return { ok: true }
    }

    const script = await getScriptRecord(payload.scriptId)
    if (!script) {
      throw new Error('Script not found')
    }

    const context = await getScriptExecutionContext(script)
    if (session) {
      applyTerminalContext(window, sessionId, context)
    } else {
      runtime.pendingTerminalContexts.set(sessionId, context)
    }
    return { ok: true }
  })

  ipcMain.handle('scriptmanager:runtime:run-in-terminal', async (event, payload: RunScriptInTerminalPayload) => {
    const window = resolveWindow(event)
    const script = await getScriptRecord(payload.scriptId)
    if (!script) {
      throw new Error('Script not found')
    }

    const context = await getScriptExecutionContext(script)
    const sessionId = normalizeTerminalSessionId(payload.sessionId)
    const terminal = ensureTerminal(window, sessionId)
    applyTerminalContext(window, sessionId, context)
    const command = buildLocalTerminalCommand({
      filePath: resolveScriptPath(script),
      language: script.language,
      interpreter: (script.collection?.pythonToolchainEnabled ? (script.collection.pythonInterpreterPath ?? context.interpreterPath) : null)
        ?? script.interpreter,
      paramValues: payload.paramValues,
    })
    terminal.terminal.write(`${command}\r`)
    return { ok: true }
  })

  ipcMain.handle('scriptmanager:runtime:run-script', async (event, payload: RunScriptPayload) => {
    const window = resolveWindow(event)
    return startLocalRun(window, payload)
  })
}
