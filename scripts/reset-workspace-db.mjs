#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const projectRoot = process.cwd()
const prismaSchemaPath = path.join(projectRoot, 'prisma', 'schema.prisma')

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const content = fs.readFileSync(filePath, 'utf8')
  const result = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue
    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

function resolveRelativeToProject(targetPath) {
  return path.isAbsolute(targetPath) ? targetPath : path.join(projectRoot, targetPath)
}

function getArgValue(argv, flagName) {
  const flag = `--${flagName}`
  const inline = argv.find((arg) => arg.startsWith(`${flag}=`))
  if (inline) {
    return inline.slice(flag.length + 1)
  }
  const index = argv.indexOf(flag)
  if (index === -1) return null
  return argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : null
}

function resolveSqlitePath(databaseUrl) {
  const normalized = databaseUrl.replace(/^['"]|['"]$/g, '')
  if (!normalized.startsWith('file:')) {
    throw new Error(`Only sqlite file URLs are supported by this reset script. Received: ${normalized}`)
  }
  const rawPath = normalized.slice('file:'.length)
  return path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(path.dirname(prismaSchemaPath), rawPath)
}

function ensureWorkspaceLayout(workspaceRoot) {
  fs.mkdirSync(workspaceRoot, { recursive: true })
  fs.mkdirSync(path.join(workspaceRoot, 'Scripts'), { recursive: true })
  fs.mkdirSync(path.join(workspaceRoot, 'APIs'), { recursive: true })
}

function removeIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return
  fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 })
}

async function readExistingSettings(sqlitePath) {
  const prisma = new PrismaClient()
  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: ['script_storage_path', 'execution_timeout_ms'],
        },
      },
    })
    return Object.fromEntries(settings.map((setting) => [setting.key, setting.value ?? '']))
  } catch {
    return {}
  } finally {
    await prisma.$disconnect().catch(() => {})
  }
}

function syncLegacyDevDatabase(sqlitePath) {
  const legacyDevSqlitePath = path.join(projectRoot, 'data', 'scriptmanager.db')
  if (path.resolve(legacyDevSqlitePath) === path.resolve(sqlitePath)) {
    return null
  }

  fs.mkdirSync(path.dirname(legacyDevSqlitePath), { recursive: true })
  fs.copyFileSync(sqlitePath, legacyDevSqlitePath)
  return legacyDevSqlitePath
}

function inferWorkspaceRoot({ cliWorkspaceRoot, existingWorkspaceRoot, envWorkspaceRoot }) {
  if (cliWorkspaceRoot) return resolveRelativeToProject(cliWorkspaceRoot)
  if (existingWorkspaceRoot?.trim()) return resolveRelativeToProject(existingWorkspaceRoot.trim())
  const scriptsSavedRoot = path.join(projectRoot, 'ScriptsSaved')
  if (fs.existsSync(scriptsSavedRoot)) return scriptsSavedRoot
  return resolveRelativeToProject(envWorkspaceRoot || './user_scripts')
}

function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env,
      shell: false,
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`))
    })
  })
}

async function runPrismaDbPush(env) {
  if (process.platform === 'win32') {
    return runCommand(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "$env:RUST_LOG='trace'; npx prisma db push --skip-generate",
      ],
      env
    )
  }

  return runCommand(
    process.execPath,
    [path.join(projectRoot, 'node_modules', 'prisma', 'build', 'index.js'), 'db', 'push', '--skip-generate'],
    {
      ...env,
      RUST_LOG: env.RUST_LOG || 'info',
    }
  )
}

async function main() {
  const argv = process.argv.slice(2)
  const args = new Set(argv)
  const wipeWorkspace = args.has('--wipe-workspace')
  const wipeBuilds = args.has('--wipe-builds')
  const cliWorkspaceRoot = getArgValue(argv, 'workspace-root')

  const env = {
    ...parseEnvFile(path.join(projectRoot, '.env')),
    ...parseEnvFile(path.join(projectRoot, '.env.local')),
    ...process.env,
  }

  const databaseUrl = env.DATABASE_URL || 'file:./data/scriptmanager.db'
  const buildsDir = resolveRelativeToProject(env.BUILDS_DIR || './builds')
  const sqlitePath = resolveSqlitePath(databaseUrl)
  const existingSettings = fs.existsSync(sqlitePath)
    ? await readExistingSettings(sqlitePath)
    : {}
  const workspaceRoot = inferWorkspaceRoot({
    cliWorkspaceRoot,
    existingWorkspaceRoot: existingSettings.script_storage_path,
    envWorkspaceRoot: env.SCRIPTS_DIR,
  })
  const scriptsDir = workspaceRoot
  const executionTimeoutMs = existingSettings.execution_timeout_ms?.trim() || '30000'

  console.log('[reset] Database URL:', databaseUrl)
  console.log('[reset] SQLite file:', sqlitePath)
  console.log('[reset] Workspace root:', scriptsDir)
  if (wipeBuilds) {
    console.log('[reset] Builds dir:', buildsDir)
  }

  removeIfExists(sqlitePath)
  removeIfExists(`${sqlitePath}-journal`)
  removeIfExists(`${sqlitePath}-shm`)
  removeIfExists(`${sqlitePath}-wal`)

  if (wipeWorkspace) {
    removeIfExists(scriptsDir)
  }

  if (wipeBuilds) {
    removeIfExists(buildsDir)
  }

  ensureWorkspaceLayout(scriptsDir)
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true })

  await runPrismaDbPush(env)

  const prisma = new PrismaClient()
  try {
    await prisma.setting.upsert({
      where: { key: 'script_storage_path' },
      update: { value: scriptsDir },
      create: { key: 'script_storage_path', value: scriptsDir },
    })
    await prisma.setting.upsert({
      where: { key: 'execution_timeout_ms' },
      update: { value: executionTimeoutMs },
      create: { key: 'execution_timeout_ms', value: executionTimeoutMs },
    })
  } finally {
    await prisma.$disconnect().catch(() => {})
  }

  console.log('[reset] Database recreated successfully.')
  console.log('[reset] Empty workspace layout ready:')
  console.log(`         ${path.join(scriptsDir, 'Scripts')}`)
  console.log(`         ${path.join(scriptsDir, 'APIs')}`)
  console.log('[reset] Restored settings:')
  console.log(`         script_storage_path=${scriptsDir}`)
  console.log(`         execution_timeout_ms=${executionTimeoutMs}`)
  const legacyDevSqlitePath = syncLegacyDevDatabase(sqlitePath)
  if (legacyDevSqlitePath) {
    console.log(`[reset] Synced dev runtime DB: ${legacyDevSqlitePath}`)
  }
}

main().catch((error) => {
  console.error('[reset] Failed:', error)
  process.exit(1)
})
