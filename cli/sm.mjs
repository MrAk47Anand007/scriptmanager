#!/usr/bin/env node
/**
 * sm — ScriptManager CLI shim
 *
 * Usage:
 *   sm list [--json]
 *   sm run <name> [--param KEY=VALUE ...]
 *   sm logs <name> [--follow]
 *   sm new <name> [--language python|node|shell]
 *   sm config [--url <base-url>]
 *
 * Config stored in ~/.scriptmanager/config.json
 * { "baseUrl": "http://localhost:3000", "apiKey": "..." }
 */

import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseArgs } from 'node:util'

const CONFIG_DIR = path.join(os.homedir(), '.scriptmanager')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const DEFAULT_BASE_URL = 'http://localhost:3000'

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    return { baseUrl: DEFAULT_BASE_URL }
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function request(method, urlStr, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const mod = url.protocol === 'https:' ? https : http
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    }
    const req = mod.request(options, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        try {
          resolve({ status: res.statusCode, body: JSON.parse(text) })
        } catch {
          resolve({ status: res.statusCode, body: text })
        }
      })
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

function streamSSE(urlStr, onLine, onDone) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const mod = url.protocol === 'https:' ? https : http
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: { Accept: 'text/event-stream' }
    }
    const req = mod.request(options, res => {
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        buf += chunk
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              onDone?.()
              res.destroy()
              resolve()
              return
            }
            onLine(data)
          }
        }
      })
      res.on('end', resolve)
    })
    req.on('error', reject)
    req.end()
  })
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdList(opts) {
  const cfg = loadConfig()
  const { status, body } = await request('GET', `${cfg.baseUrl}/api/scripts`)
  if (status !== 200) {
    console.error(`Error ${status}: ${JSON.stringify(body)}`)
    process.exit(1)
  }
  if (opts.json) {
    console.log(JSON.stringify(body, null, 2))
    return
  }
  if (!body.length) {
    console.log('No scripts found.')
    return
  }
  const nameW = Math.max(4, ...body.map(s => s.name.length))
  const langW = Math.max(8, ...body.map(s => (s.language || '').length))
  console.log(`${'NAME'.padEnd(nameW)}  ${'LANGUAGE'.padEnd(langW)}  LAST RUN`)
  console.log(`${'-'.repeat(nameW)}  ${'-'.repeat(langW)}  --------`)
  for (const s of body) {
    const lastRun = s.last_run ? new Date(s.last_run).toLocaleString() : '—'
    console.log(`${s.name.padEnd(nameW)}  ${(s.language || '').padEnd(langW)}  ${lastRun}`)
  }
}

async function cmdRun(name, opts) {
  if (!name) {
    console.error('Usage: sm run <name> [--param KEY=VALUE ...]')
    process.exit(1)
  }
  const cfg = loadConfig()

  // Resolve script id
  const { status: lStatus, body: scripts } = await request('GET', `${cfg.baseUrl}/api/scripts`)
  if (lStatus !== 200) { console.error('Failed to fetch scripts'); process.exit(1) }
  const script = scripts.find(s => s.name === name)
  if (!script) {
    console.error(`Script "${name}" not found. Use 'sm list' to see available scripts.`)
    process.exit(1)
  }

  // Build paramValues from --param KEY=VALUE flags
  const paramValues = {}
  for (const p of (opts.param || [])) {
    const eqIdx = p.indexOf('=')
    if (eqIdx < 1) { console.error(`Invalid param format: "${p}" — expected KEY=VALUE`); process.exit(1) }
    paramValues[p.slice(0, eqIdx)] = p.slice(eqIdx + 1)
  }

  // Trigger run
  const { status: rStatus, body: run } = await request('POST', `${cfg.baseUrl}/api/scripts/${script.id}/run`, { paramValues })
  if (rStatus !== 200 && rStatus !== 201) {
    console.error(`Failed to start script: ${JSON.stringify(run)}`)
    process.exit(1)
  }

  const buildId = run.build_id
  console.log(`▶  Running "${name}" (build ${buildId.slice(0, 8)}…)`)
  console.log('─'.repeat(60))

  // Stream output
  await streamSSE(
    `${cfg.baseUrl}/api/builds/${buildId}/stream`,
    line => process.stdout.write(line + '\n'),
    () => { /* done */ }
  )

  // Fetch final build status
  const { body: builds } = await request('GET', `${cfg.baseUrl}/api/builds/${script.id}`)
  const finalBuild = Array.isArray(builds) ? builds.find(b => b.id === buildId) : null
  const finalStatus = finalBuild?.status ?? 'unknown'
  console.log('─'.repeat(60))
  if (finalStatus === 'success') {
    console.log('✓  Completed successfully')
  } else if (finalStatus === 'timeout') {
    console.log('⏱  Timed out')
    process.exit(2)
  } else {
    console.log(`✗  Finished with status: ${finalStatus}`)
    process.exit(1)
  }
}

async function cmdLogs(name, opts) {
  if (!name) {
    console.error('Usage: sm logs <name>')
    process.exit(1)
  }
  const cfg = loadConfig()

  const { status: lStatus, body: scripts } = await request('GET', `${cfg.baseUrl}/api/scripts`)
  if (lStatus !== 200) { console.error('Failed to fetch scripts'); process.exit(1) }
  const script = scripts.find(s => s.name === name)
  if (!script) {
    console.error(`Script "${name}" not found.`)
    process.exit(1)
  }

  const { status: bStatus, body: builds } = await request('GET', `${cfg.baseUrl}/api/builds/${script.id}`)
  if (bStatus !== 200 || !builds.length) {
    console.log('No builds found for this script.')
    return
  }

  const latest = builds[0]
  console.log(`Last build: ${latest.id.slice(0, 8)}…  status=${latest.status}`)
  console.log('─'.repeat(60))

  const { status: oStatus, body: output } = await request('GET', `${cfg.baseUrl}/api/builds/output/${script.id}/${latest.id}`)
  if (oStatus !== 200) {
    console.error('Could not retrieve log output.')
    process.exit(1)
  }
  console.log(typeof output === 'string' ? output : (output.output ?? '(empty)'))
}

async function cmdNew(name, opts) {
  if (!name) {
    console.error('Usage: sm new <name> [--language python|node|shell]')
    process.exit(1)
  }
  const cfg = loadConfig()
  const language = opts.language || 'python'
  const { status, body } = await request('POST', `${cfg.baseUrl}/api/scripts`, { name, language })
  if (status === 409) {
    console.error(`A script named "${name}" already exists.`)
    process.exit(1)
  }
  if (status !== 200 && status !== 201) {
    console.error(`Failed to create script: ${JSON.stringify(body)}`)
    process.exit(1)
  }
  console.log(`✓  Created script "${body.name}" (id: ${body.id.slice(0, 8)}…)`)
  console.log(`   Open in browser: ${cfg.baseUrl}`)
}

async function cmdConfig(opts) {
  const cfg = loadConfig()
  if (opts.url) {
    cfg.baseUrl = opts.url.replace(/\/$/, '')
    saveConfig(cfg)
    console.log(`✓  Base URL set to: ${cfg.baseUrl}`)
  } else {
    console.log(JSON.stringify(cfg, null, 2))
  }
}

// ---------------------------------------------------------------------------
// Arg parsing + dispatch
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2)
const command = rawArgs[0]

if (!command || command === '--help' || command === '-h') {
  console.log(`
sm — ScriptManager CLI

Usage:
  sm list [--json]                          List all scripts
  sm run <name> [--param KEY=VALUE ...]     Run a script and stream output
  sm logs <name>                            Show last build output
  sm new <name> [--language python|node|shell]  Create a new script
  sm config [--url <base-url>]              Get/set config (default URL: http://localhost:3000)

Config file: ~/.scriptmanager/config.json
`.trimStart())
  process.exit(0)
}

const subArgs = rawArgs.slice(1)

try {
  if (command === 'list') {
    const { values } = parseArgs({ args: subArgs, options: { json: { type: 'boolean', default: false } } })
    await cmdList(values)
  } else if (command === 'run') {
    const name = subArgs.find(a => !a.startsWith('-'))
    const { values } = parseArgs({
      args: subArgs.filter(a => a !== name),
      options: { param: { type: 'string', multiple: true } }
    })
    await cmdRun(name, values)
  } else if (command === 'logs') {
    const name = subArgs.find(a => !a.startsWith('-'))
    await cmdLogs(name, {})
  } else if (command === 'new') {
    const name = subArgs.find(a => !a.startsWith('-'))
    const { values } = parseArgs({
      args: subArgs.filter(a => a !== name),
      options: { language: { type: 'string', default: 'python' } }
    })
    await cmdNew(name, values)
  } else if (command === 'config') {
    const { values } = parseArgs({ args: subArgs, options: { url: { type: 'string' } } })
    await cmdConfig(values)
  } else {
    console.error(`Unknown command: ${command}. Run 'sm --help' for usage.`)
    process.exit(1)
  }
} catch (err) {
  console.error(`Error: ${err.message}`)
  process.exit(1)
}
