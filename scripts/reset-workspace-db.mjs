#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

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

async function main() {
  const args = new Set(process.argv.slice(2))
  const wipeWorkspace = args.has('--wipe-workspace')
  const wipeBuilds = args.has('--wipe-builds')

  const env = {
    ...parseEnvFile(path.join(projectRoot, '.env')),
    ...parseEnvFile(path.join(projectRoot, '.env.local')),
    ...process.env,
  }

  const databaseUrl = env.DATABASE_URL || 'file:./data/scriptmanager.db'
  const scriptsDir = resolveRelativeToProject(env.SCRIPTS_DIR || './user_scripts')
  const buildsDir = resolveRelativeToProject(env.BUILDS_DIR || './builds')
  const sqlitePath = resolveSqlitePath(databaseUrl)

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

  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  await runCommand(npxCommand, ['prisma', 'db', 'push', '--skip-generate'], env)

  console.log('[reset] Database recreated successfully.')
  console.log('[reset] Empty workspace layout ready:')
  console.log(`         ${path.join(scriptsDir, 'Scripts')}`)
  console.log(`         ${path.join(scriptsDir, 'APIs')}`)
}

main().catch((error) => {
  console.error('[reset] Failed:', error)
  process.exit(1)
})
