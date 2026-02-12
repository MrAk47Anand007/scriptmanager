import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import { prisma } from '@/lib/db'
import path from 'path'
import fs from 'fs'

// Module-level map: buildId -> EventEmitter (Node.js equivalent of Python's _output_queues dict)
const buildEmitters = new Map<string, EventEmitter>()

interface ScriptInfo {
  id: string
  filename: string
  language: string
  interpreter?: string | null
}

async function getScriptsDir(): Promise<string> {
  const setting = await prisma.setting.findUnique({
    where: { key: 'script_storage_path' }
  })
  const dir = setting?.value ?? process.env.SCRIPTS_DIR ?? path.join(process.cwd(), 'user_scripts')
  if (!path.isAbsolute(dir)) return path.join(process.cwd(), dir)
  return dir
}

function getBuildsDir(): string {
  const dir = process.env.BUILDS_DIR ?? path.join(process.cwd(), 'builds')
  if (!path.isAbsolute(dir)) return path.join(process.cwd(), dir)
  return dir
}

function resolveInterpreter(language: string, interpreter: string | null | undefined, scriptPath: string): [string, string[]] {
  switch (language) {
    case 'python': {
      // Use 'python' on Windows, 'python3' elsewhere
      const cmd = process.platform === 'win32' ? 'python' : 'python3'
      return [cmd, [scriptPath]]
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

export async function executeScriptAsync(buildId: string, script: ScriptInfo): Promise<void> {
  const emitter = new EventEmitter()
  buildEmitters.set(buildId, emitter)

  const scriptsDir = await getScriptsDir()
  const buildsDir = getBuildsDir()
  const scriptPath = path.join(scriptsDir, script.filename)
  const buildScriptDir = path.join(buildsDir, script.filename.replace(/[^a-zA-Z0-9_.-]/g, '_'))
  const logFile = path.join(buildScriptDir, `${buildId}.log`)

  // ... (rest of the function remains mostly the same, ensuring async correctness)
  fs.mkdirSync(buildScriptDir, { recursive: true })

  const [cmd, args] = resolveInterpreter(script.language, script.interpreter, scriptPath)

  try {
    await prisma.build.update({
      where: { id: buildId },
      data: { status: 'running', startedAt: new Date(), logFile }
    })

    const logStream = fs.createWriteStream(logFile, { encoding: 'utf8' })

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

    const child = spawn(cmd, args, {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const onData = (chunk: Buffer) => {
      const line = chunk.toString()
      logStream.write(line)
      emitter.emit('line', line)
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    child.on('error', async (err) => {
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
      const exitCode = code ?? -1
      logStream.end()
      emitter.emit('done')
      buildEmitters.delete(buildId)

      await prisma.build.update({
        where: { id: buildId },
        data: {
          status: exitCode === 0 ? 'success' : 'failure',
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

export async function getScriptFilePath(filename: string): Promise<string> {
  const scriptsDir = await getScriptsDir()
  return path.join(scriptsDir, filename)
}

export async function ensureScriptsDirExists(): Promise<void> {
  const scriptsDir = await getScriptsDir()
  fs.mkdirSync(scriptsDir, { recursive: true })
  fs.mkdirSync(getBuildsDir(), { recursive: true })
}
