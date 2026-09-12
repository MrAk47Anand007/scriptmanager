#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const main = readFileSync(join(root, 'src', 'main.tsx'), 'utf8')
const contract = readFileSync(join(root, 'src', 'types', 'electron.d.ts'), 'utf8')

function extractBlock(source, marker) {
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`Could not find contract marker: ${marker}`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(`Could not parse block for marker: ${marker}`)
}

function requiredContractKeys(block) {
  const keys = new Set()
  const pattern = /^\s{8,}([A-Za-z][A-Za-z0-9]*)\s*:\s*\(/gm
  for (const match of block.matchAll(pattern)) keys.add(match[1])
  return keys
}

function exposedObjectKeys(block) {
  const keys = new Set()
  const pattern = /^\s{4,}([A-Za-z][A-Za-z0-9]*)\s*:/gm
  for (const match of block.matchAll(pattern)) keys.add(match[1])
  return keys
}

const contractTop = extractBlock(contract, 'scriptManagerDesktop?:')
const contractRuntime = extractBlock(contractTop, 'runtime?:')
const contractAgents = extractBlock(contractTop, 'agents?:')

const bridgeTop = extractBlock(main, 'window.scriptManagerDesktop =')
const bridgeRuntime = extractBlock(bridgeTop, 'runtime:')
const bridgeAgents = extractBlock(bridgeRuntime, 'agents:')

const checks = [
  ['scriptManagerDesktop', requiredContractKeys(contractTop), exposedObjectKeys(bridgeTop)],
  ['scriptManagerDesktop.runtime', requiredContractKeys(contractRuntime), exposedObjectKeys(bridgeRuntime)],
  ['scriptManagerDesktop.agents', requiredContractKeys(contractAgents), exposedObjectKeys(bridgeAgents)],
]

let failures = 0
for (const [label, required, exposed] of checks) {
  for (const key of [...required].sort()) {
    if (!exposed.has(key)) {
      console.error(`[bridge-contract] ${label}.${key} is required by src/types/electron.d.ts but missing in src/main.tsx`)
      failures += 1
    }
  }
}

if (failures > 0) {
  console.error(`\n[bridge-contract] ${failures} required bridge method(s) missing.`)
  process.exit(1)
}

console.log('[bridge-contract] OK: required desktop bridge methods are exposed.')
