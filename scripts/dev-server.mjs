#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { getDevServerEnvironment } from './dev-server-environment.mjs'

const projectRoot = process.cwd()
const nextDir = path.join(projectRoot, '.next')
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const devEnvironment = getDevServerEnvironment(process.env)

async function removeNextDir() {
  try {
    await fs.rm(nextDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (err) {
    if (process.platform !== 'win32') {
      throw err
    }

    await new Promise((resolve, reject) => {
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-Command',
          `if (Test-Path '${nextDir}') { Remove-Item -LiteralPath '${nextDir}' -Recurse -Force -ErrorAction Stop }`,
        ],
        { stdio: 'inherit' }
      )

      child.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Failed to clean .next directory (exit ${code})`))
      })
      child.on('error', reject)
    })
  }
}

async function main() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(projectRoot, 'scripts', 'ensure-prisma-client.mjs')], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: devEnvironment,
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Failed to validate Prisma Client (exit ${code})`))
      }
    })
    child.on('error', reject)
  })

  await removeNextDir()

  const child = process.platform === 'win32'
    ? spawn(
      'cmd.exe',
      ['/d', '/s', '/c', `${npxCommand} ts-node -r tsconfig-paths/register --project tsconfig.server.json server.ts`],
      {
        cwd: projectRoot,
        stdio: 'inherit',
        env: devEnvironment,
      }
    )
    : spawn(
      'npx',
      ['ts-node', '-r', 'tsconfig-paths/register', '--project', 'tsconfig.server.json', 'server.ts'],
      {
        cwd: projectRoot,
        stdio: 'inherit',
        env: devEnvironment,
      }
    )

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })

  child.on('error', (err) => {
    console.error(err)
    process.exit(1)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
