import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import { prisma } from '@/lib/db'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { assertSafeStoredFilename } from '@/lib/executionSafety'
import { ensureDesktopWorkspaceLayout, getDesktopWorkspaceLayout } from '@/lib/workspaceLayout'

// Module-level map: buildId -> EventEmitter (Node.js equivalent of Python's _output_queues dict)
const buildEmitters = new Map<string, EventEmitter>()

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
  paramValues?: Record<string, string>
): Promise<void> {
  const emitter = ensureBuildEmitter(buildId)

  const buildsDir = getBuildsDir()
  const buildScriptDir = path.join(buildsDir, script.filename.replace(/[^a-zA-Z0-9_.-]/g, '_'))
  const logFile = path.join(buildScriptDir, `${buildId}.log`)

  try {
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
    const buildUpdatePromise = prisma.build.update({
      where: { id: buildId },
      data: { status: 'running', startedAt, logFile }
    })

    if (!fs.existsSync(scriptPath)) {
      const errMsg = `Error: Script file not found: ${scriptPath}\n`
      logStream.write(errMsg)
      logStream.end()
      emitter.emit('line', errMsg)
      emitter.emit('done')
      buildEmitters.delete(buildId)

      await prisma.build.update({
        where: { id: buildId },
        data: { status: 'failure', exitCode: 1, finishedAt: new Date() }
      })
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
    const scriptEnv: Record<string, string> = {}
    for (const ev of scriptEnvVarsFromDB) {
      scriptEnv[ev.key] = ev.value
    }

    // Determine timeout: per-script override → global setting → hardcoded default
    const timeoutMs = script.timeoutMs ?? defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS

    const child = spawn(cmd, args, {
      // Precedence: process.env < script env vars < param values (most specific wins)
      env: { ...process.env, PYTHONUNBUFFERED: '1', ...scriptEnv, ...paramEnv },
      stdio: ['ignore', 'pipe', 'pipe']
    })
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
      emitter.emit('done')
      buildEmitters.delete(buildId)

      await prisma.build.update({
        where: { id: buildId },
        data: { status: 'failure', exitCode: -1, finishedAt: new Date() }
      })
    })

    child.on('close', async (code) => {
      clearTimeout(timeoutHandle)
      const exitCode = code ?? -1
      logStream.end()
      emitter.emit('done')
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

      // Update script's last_run timestamp
      await prisma.script.update({
        where: { id: script.id },
        data: { lastRun: new Date() }
      })
    })
  } catch (err) {
    buildEmitters.delete(buildId)
    const errMsg = `\nInternal error: ${err}\n`
    await prisma.build.update({
      where: { id: buildId },
      data: { status: 'failure', exitCode: -1, finishedAt: new Date() }
    }).catch(() => { })
    emitter.emit('line', errMsg)
    emitter.emit('done')
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

export async function ensureScriptsDirExists(): Promise<void> {
  const scriptsDir = await getScriptsDir()
  ensureDesktopWorkspaceLayout(getDesktopWorkspaceLayout(path.dirname(scriptsDir)))
  fs.mkdirSync(getBuildsDir(), { recursive: true })
}
