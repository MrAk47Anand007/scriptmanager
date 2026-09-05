#!/usr/bin/env node
// Migration guard (completion plan W1.2): fails when a runtime client adds a
// desktop `/api/*` fallback. Files in ALLOWED may still contain `/api` calls
// behind explicit web-mode guards (web-only surfaces kept intentionally).

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const libDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib')

// Files where `/api` references are intentional (web-mode guarded code).
// Each file below starts every web call with an `isTauri()` / desktop-runtime
// predicate, so Tauri desktop mode can never reach them (plan W1.2).
const ALLOWED = new Set([
  'workflowsRuntimeClient.ts',
  'bootstrapRuntimeClient.ts',
  'scriptsRuntimeClient.ts',
  'apiRuntimeClient.ts',
  'gitRuntimeClient.ts',
  'opsRuntimeClient.ts',
  'tauriInvoke.ts',
])

let failures = 0
for (const file of readdirSync(libDir)) {
  if (!file.endsWith('.ts')) continue
  if (ALLOWED.has(file)) continue
  const text = readFileSync(join(libDir, file), 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    if (/fetch\((['"`])\/api\//.test(line) || /axios\.(get|post|put|delete)\((['"`])\/api\//.test(line)) {
      console.error(`[guard] ${file}:${index + 1} desktop /api fallback detected: ${line.trim().slice(0, 100)}`)
      failures += 1
    }
  })
}

if (failures > 0) {
  console.error(`\n[guard] ${failures} unguarded desktop /api fallback(s) found. Runtime clients must use the Tauri bridge.`)
  process.exit(1)
}
console.log('[guard] OK: no unguarded desktop /api fallbacks in runtime clients.')
