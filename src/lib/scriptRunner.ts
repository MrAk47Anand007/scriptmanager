import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { prisma } from '@/lib/db'
import path from 'path'
import fs from 'fs'
import { resolveScriptEnvironment } from './secrets/runtime'
import os from 'os'
import { assertSafeStoredFilename } from '@/lib/executionSafety'
import { ensureDesktopWorkspaceLayout, getDesktopWorkspaceLayout } from '@/lib/workspaceLayout'
import { ensureFreshScript } from '@/lib/storage/syncService'
import { executionTelemetry, lifecycleEventType, type ExecutionContext, createCorrelationId } from '@/lib/execution'

// Module-level map: buildId -> EventEmitter (Node.js equivalent of Python's _output_queues dict)
const buildEmitters = new Map<string, EventEmitter>()
const runningChildren = new Map<string, ChildProcess>()

const DEFAULT_TIMEOUT_MS = 30_000 // 30 seconds
const SETTINGS_CACHE_TTL_MS = 30_000
let cachedScriptsDir: { value: string; expiresAt: number } | null = null
let cachedDefaultTimeoutMs: { value: number; expiresAt: number } | null = null

interface ScriptInfo {
  id: string
  filename: string
  sourcePath?: string | null
  language: string
  interpreter?: string | null
  timeoutMs?: number | null
}

async function getScriptsDir(): Promise<string> {
  if (cachedScriptsDir && cachedScriptsDir.expiresAt > Date.now()) {
    return cachedScriptsDir.value
  }

  const setting = await prisma.setting.findUnique({
    where: { key: 'script_storage_path' }
  })
  const dir = setting?.value ?? process.env.SCRIPTS_DIR ?? path.join(process.cwd(), 'user_scripts')
  const resolvedDir = getDesktopWorkspaceLayout(path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir)).scriptsRoot
  cachedScriptsDir = {
    value: resolvedDir,
    expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
  }
  return resolvedDir
}

function getBuildsDir(): string {
  const defaultDir = process.cwd().includes('OneDrive')
    ? path.join(os.tmpdir(), 'ScriptManager', 'builds')
    : path.join(process.cwd(), 'builds')
  const dir = process.env.BUILDS_DIR ?? defaultDir
  if (!path.isAbsolute(dir)) return path.join(process.cwd(), dir)
  return dir
}

async function getDefaultTimeoutMs(): Promise<number> {
  if (cachedDefaultTimeoutMs && cachedDefaultTimeoutMs.expiresAt > Date.now()) {
    return cachedDefaultTimeoutMs.value
  }

  const globalTimeoutSetting = await prisma.setting.findUnique({ where: { key: 'execution_timeout_ms' } })
  const value = globalTimeoutSetting?.value ? parseInt(globalTimeoutSetting.value, 10) : DEFAULT_TIMEOUT_MS
  cachedDefaultTimeoutMs = {
    value,
    expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
  }
  return value
}

function resolveInterpreter(language: string, interpreter: string | null | undefined, scriptPath: string): [string, string[]] {
  switch (language) {
    case 'python': {
      // Use 'python' on Windows, 'python3' elsewhere
      const cmd = process.platform === 'win32' ? 'python' : 'python3'
      return [cmd, ['-u', scriptPath]]
    }
    case 'node':
      return ['node', [scriptPath]]
    case 'shell': {
      if (process.platform === 'win32') {
        return ['cmd', ['/c', scriptPath]]
      }
      return ['bash', [scriptPath]]
    }
    case 'custom':
      return [interpreter ?? (process.platform === 'win32' ? 'python' : 'python3'), [scriptPath]]
    default:
      return [process.platform === 'win32' ? 'python' : 'python3', [scriptPath]]
  }
}

export async function executeScriptAsync(
  buildId: string,
  script: ScriptInfo,
  paramValues?: Record<string, string>,
  context: ExecutionContext = {
    correlationId: createCorrelationId(),
    actor: { type: 'system', id: 'script-runner' },
    trigger: 'manual',
  },
): Promise<void> {
  const emitter = ensureBuildEmitter(buildId)

  const buildsDir = getBuildsDir()
  const buildScriptDir = path.join(buildsDir, script.filename.replace(/[^a-zA-Z0-9_.-]/g, '_'))
  const logFile = path.join(buildScriptDir, `${buildId}.log`)

  try {
    // Pull-on-run: refresh cloud-bound scripts before executing. Never blocks —
    // remote failures degrade to the cached local copy with a warning line.
    const freshness = await ensureFreshScript(prisma, script.id, await getScriptsDir())
    if (freshness.pulled) {
      emitter.emit('line', '[cloud] pulled latest version from storage provider')
    } else if (freshness.warning) {
      emitter.emit('line', `[cloud] ${freshness.warning}`)
    }

    const [scriptPath, scriptEnvVarsFromDB, defaultTimeoutMs] = await Promise.all([
      getScriptResolvedFilePath(script),
      prisma.scriptEnvVar.findMany({ where: { scriptId: script.id } }),
      script.timeoutMs ? Promise.resolve(script.timeoutMs) : getDefaultTimeoutMs(),
      fs.promises.mkdir(buildScriptDir, { recursive: true }),
    ])

    const [cmd, args] = resolveInterpreter(script.language, script.interpreter, scriptPath)
    console.log(`[ScriptRunner] Executing: ${cmd} ${args.join(' ')} (Language: ${script.language})`)

    const logStream = fs.createWriteStream(logFile, { encoding: 'utf8' })
    logStream.setMaxListeners(20); // Suppress warnings if we attach multiple listeners (though we shouldn't be)

    const startedAt = new Date()
    await executionTelemetry.emit({
      type: lifecycleEventType('running'), executionKind: 'script', correlationId: context.correlationId,
      actor: context.actor, target: { type: 'script', id: script.id, name: script.filename },
      data: { buildId, trigger: context.trigger },
    })
    const buildUpdatePromise = prisma.build.update({
      where: { id: buildId },
      data: { status: 'running', startedAt, logFile }
    })

    if (!fs.existsSync(scriptPath)) {
      const errMsg = `Error: Script file not found: ${scriptPath}\n`
      logStream.write(errMsg)
      logStream.end()
      emitter.emit('line', errMsg)
      buildEmitters.delete(buildId)

      await prisma.build.update({
        where: { id: buildId },
        data: { status: 'failure', exitCode: 1, finishedAt: new Date() }
      })
      await emitFinalScriptEvent('failure', 1)
      emitter.emit('done')
      return
    }

    // Build parameter env vars — sanitize keys to valid env var names
    const paramEnv: Record<string, string> = {}
    if (paramValues) {
      for (const [key, val] of Object.entries(paramValues)) {
        const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_')
        paramEnv[safeKey] = val
      }
    }

    // Load per-script env vars from DB
    const scriptEnv = await resolveScriptEnvironment(prisma, script.id, scriptEnvVarsFromDB)

    // Determine timeout: per-script override → global setting → hardcoded default
    const timeoutMs = script.timeoutMs ?? defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS

    const child = spawn(cmd, args, {
      // Precedence: process.env < script env vars < param values (most specific wins)
      env: { ...process.env, PYTHONUNBUFFERED: '1', ...scriptEnv, ...paramEnv },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    runningChildren.set(buildId, child)
    buildUpdatePromise.catch((error) => {
      console.error('[ScriptRunner] Failed to mark build as running:', error)
    })

    let timedOut = false
    const timeoutHandle = setTimeout(() => {
      timedOut = true
      const msg = `\n[ScriptManager] Execution timed out after ${timeoutMs! / 1000}s. Killing process...\n`
      logStream.write(msg)
      emitter.emit('line', msg)
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL')
      }, 2000)
    }, timeoutMs)

    const onData = (chunk: Buffer) => {
      const line = chunk.toString()
      logStream.write(line)
      emitter.emit('line', line)
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    child.on('error', async (err) => {
      clearTimeout(timeoutHandle)
      const errMsg = `\nError starting process: ${err.message}\nMake sure '${cmd}' is installed and accessible.\n`
      logStream.write(errMsg)
      logStream.end()
      emitter.emit('line', errMsg)
      runningChildren.delete(buildId)
      buildEmitters.delete(buildId)

      await prisma.build.update({
        where: { id: buildId },
        data: { status: 'failure', exitCode: -1, finishedAt: new Date() }
      })
      await emitFinalScriptEvent('failure', -1)
      emitter.emit('done')
    })

    child.on('close', async (code) => {
      clearTimeout(timeoutHandle)
      const exitCode = code ?? -1
      logStream.end()
      runningChildren.delete(buildId)
      buildEmitters.delete(buildId)

      const finalStatus = timedOut ? 'timeout' : (exitCode === 0 ? 'success' : 'failure')
      await prisma.build.update({
        where: { id: buildId },
        data: {
          status: finalStatus,
          exitCode,
          finishedAt: new Date()
        }
      })
      await emitFinalScriptEvent(finalStatus, exitCode)

      // Update script's last_run timestamp
      await prisma.script.update({
        where: { id: script.id },
        data: { lastRun: new Date() }
      })
      emitter.emit('done')
    })
  } catch (err) {
    runningChildren.delete(buildId)
    buildEmitters.delete(buildId)
    const errMsg = `\nInternal error: ${err}\n`
    await prisma.build.update({
      where: { id: buildId },
      data: { status: 'failure', exitCode: -1, finishedAt: new Date() }
    }).catch(() => { })
    await emitFinalScriptEvent('failure', -1)
    emitter.emit('line', errMsg)
    emitter.emit('done')
  }

  async function emitFinalScriptEvent(status: 'success' | 'failure' | 'timeout', exitCode: number) {
    await executionTelemetry.emit({
      type: lifecycleEventType(status), executionKind: 'script', correlationId: context.correlationId,
      actor: context.actor, target: { type: 'script', id: script.id, name: script.filename },
      data: { buildId, trigger: context.trigger, exitCode },
    })
  }
}

export function getBuildEmitter(buildId: string): EventEmitter | undefined {
  return buildEmitters.get(buildId)
}

export function ensureBuildEmitter(buildId: string): EventEmitter {
  const existing = buildEmitters.get(buildId)
  if (existing) return existing

  const emitter = new EventEmitter()
  buildEmitters.set(buildId, emitter)
  return emitter
}

export function killRunningBuild(buildId: string): boolean {
  const child = runningChildren.get(buildId)
  if (!child) return false
  child.kill('SIGTERM')
  setTimeout(() => {
    if (runningChildren.has(buildId)) child.kill('SIGKILL')
  }, 2000)
  return true
}

export async function getScriptFilePath(filename: string): Promise<string> {
  const scriptsDir = await getScriptsDir()
  const safeFilename = assertSafeStoredFilename(filename)
  const resolvedPath = path.resolve(scriptsDir, safeFilename)
  const resolvedDir = path.resolve(scriptsDir)

  if (!resolvedPath.startsWith(`${resolvedDir}${path.sep}`) && resolvedPath !== resolvedDir) {
    throw new Error('Unsafe script path')
  }

  return resolvedPath
}

export async function getScriptResolvedFilePath(script: { filename: string; sourcePath?: string | null }): Promise<string> {
  if (script.sourcePath) {
    return path.resolve(script.sourcePath)
  }

  const collection = (script as { collection?: { folderPath?: string | null } | null }).collection
  if (collection?.folderPath) {
    return path.resolve(collection.folderPath, path.basename(script.filename))
  }

  return getScriptFilePath(script.filename)
}

/** Resolved managed scripts root — used by the cloud sync service callers. */
export async function getScriptsRootDir(): Promise<string> {
  return getScriptsDir()
}

export async function ensureScriptsDirExists(): Promise<void> {
  const scriptsDir = await getScriptsDir()
  ensureDesktopWorkspaceLayout(getDesktopWorkspaceLayout(path.dirname(scriptsDir)))
  fs.mkdirSync(getBuildsDir(), { recursive: true })
}
