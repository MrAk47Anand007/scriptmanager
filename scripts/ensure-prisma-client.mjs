#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()

function getNpxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

function runNodeSanityCheck() {
  const sanityScript = `
    require('dotenv').config();
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    (async () => {
      try {
        await prisma.$queryRawUnsafe('select 1 as value');
        process.exit(0);
      } catch (error) {
        console.error(error?.message ?? error);
        process.exit(1);
      } finally {
        await prisma.$disconnect().catch(() => {});
      }
    })();
  `

  return spawnSync(process.execPath, ['-e', sanityScript], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
  })
}

function runPrismaGenerate() {
  return spawnSync(getNpxCommand(), ['prisma', 'generate'], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: 'inherit',
  })
}

function hasGeneratedClient() {
  return fs.existsSync(path.join(projectRoot, 'node_modules', '.prisma', 'client', 'index.js'))
}

function main() {
  if (process.env.PRISMA_SKIP_GENERATE === '1') {
    return
  }

  const needsInitialGenerate = !hasGeneratedClient()
  const initialCheck = needsInitialGenerate ? { status: 1 } : runNodeSanityCheck()

  if (initialCheck.status === 0) {
    return
  }

  console.warn('[Prisma] Local client check failed. Regenerating Prisma Client...')
  if (initialCheck.stderr?.trim()) {
    console.warn(initialCheck.stderr.trim())
  }

  const generateResult = runPrismaGenerate()
  if (generateResult.status !== 0) {
    process.exit(generateResult.status ?? 1)
  }

  const retryCheck = runNodeSanityCheck()
  if (retryCheck.status !== 0) {
    if (retryCheck.stderr?.trim()) {
      console.error(retryCheck.stderr.trim())
    }
    process.exit(retryCheck.status ?? 1)
  }
}

main()
