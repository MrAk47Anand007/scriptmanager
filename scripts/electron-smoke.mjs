import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { platform } from 'node:process'

const executable = process.env.SCRIPTMANAGER_SMOKE_BINARY
  ?? (platform === 'win32' ? 'release/win-unpacked/ScriptManager.exe' : 'release/linux-unpacked/scriptmanager')

if (!existsSync(executable)) {
  console.error(`Packaged Electron binary not found: ${executable}`)
  process.exit(1)
}

const child = spawn(executable, [], {
  env: { ...process.env, SCRIPTMANAGER_SMOKE_TEST: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const timeout = setTimeout(() => finish(1), 30_000)
child.stdout.on('data', inspectOutput)
child.stderr.on('data', inspectOutput)
child.once('error', () => finish(1))
child.once('exit', (code) => finish(code === 0 ? 1 : code ?? 1))

function inspectOutput(chunk) {
  const output = chunk.toString()
  if (output.includes('/login')) finish(1)
  if (output.includes('SMOKE_URL=http://localhost:3141/')) finish(0)
}

function finish(code) {
  clearTimeout(timeout)
  if (!child.killed) child.kill()
  process.exit(code)
}
