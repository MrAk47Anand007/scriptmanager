import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import readline from 'node:readline'
import type { AcpEvent, AcpLaunchOptions, AcpProvider, AcpProviderAdapter, AcpSession, AcpSessionState } from '../src/lib/agents/types'

export type DesktopAgentProvider = 'codex' | 'claude'
export interface DesktopAgentLaunch { provider: DesktopAgentProvider; sessionId: string; profileId: string; cwd: string }

const PROVIDERS = {
  codex: { provider: 'codex' as const, executable: 'codex-acp', args: [] as string[] },
  claude: { provider: 'claude' as const, executable: 'claude-agent-acp', args: [] as string[] },
}

export function getAgentProviderSpec(provider: DesktopAgentProvider) { const spec = PROVIDERS[provider]; if (!spec) throw new Error(`Unsupported agent provider: ${provider}`); return spec }
export function validateAgentLaunch(payload: DesktopAgentLaunch) {
  getAgentProviderSpec(payload.provider)
  if (!payload.sessionId?.trim() || !payload.profileId?.trim() || !payload.cwd?.trim()) throw new Error('Agent launch requires sessionId, profileId, and cwd')
  return true
}

export function createDesktopAgentRuntime(emit: (sessionId: string, event: unknown) => void) {
  const sessions = new Map<string, ChildProcessWithoutNullStreams>()
  const listeners = new Map<string, Set<(event: unknown) => void>>()
  const managedSessions = new Set<string>()
  const send = (sessionId: string, value: unknown) => { const child = sessions.get(sessionId); if (!child || child.killed) throw new Error(`Agent session ${sessionId} is not running`); child.stdin.write(`${JSON.stringify(value)}\n`) }
  const publish = (sessionId: string, event: unknown) => {
    emit(sessionId, event)
    for (const listener of listeners.get(sessionId) ?? []) listener(event)
  }
  return {
    async discover() {
      return Promise.all((Object.keys(PROVIDERS) as DesktopAgentProvider[]).map(async (provider) => new Promise<{ provider: DesktopAgentProvider; available: boolean; executable: string; version?: string }>((resolve) => {
        const spec = getAgentProviderSpec(provider); const child = spawn(spec.executable, ['--version'], { windowsHide: true })
        let output = ''; child.stdout.on('data', (chunk) => { output += chunk.toString() }); child.on('error', () => resolve({ provider, available: false, executable: spec.executable })); child.on('close', (code) => resolve({ provider, available: code === 0, executable: spec.executable, version: output.trim() || undefined }))
      })))
    },
    launch(payload: DesktopAgentLaunch) {
      validateAgentLaunch(payload); if (sessions.has(payload.sessionId)) throw new Error(`Agent session ${payload.sessionId} already exists`)
      const spec = getAgentProviderSpec(payload.provider); const child = spawn(spec.executable, spec.args, { cwd: payload.cwd, env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); sessions.set(payload.sessionId, child)
      readline.createInterface({ input: child.stdout }).on('line', (line) => { try { publish(payload.sessionId, JSON.parse(line)) } catch { publish(payload.sessionId, { type: 'message', message: { role: 'assistant', content: line } }) } })
      child.stderr.on('data', (chunk) => publish(payload.sessionId, { type: 'error', error: { code: 'provider_stderr', message: chunk.toString(), recoverable: true } }))
      child.on('exit', (code, signal) => { sessions.delete(payload.sessionId); publish(payload.sessionId, { type: 'state', state: code === 0 ? 'terminated' : 'error', code, signal }); managedSessions.delete(payload.sessionId); listeners.delete(payload.sessionId) })
      child.on('error', (error) => publish(payload.sessionId, { type: 'error', error: { code: 'launch_failed', message: error.message, recoverable: false } }))
      send(payload.sessionId, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientInfo: { name: 'ScriptManager', version: '0.1.0' } } })
      return { sessionId: payload.sessionId, provider: payload.provider }
    },
    input(sessionId: string, message: unknown) { send(sessionId, { jsonrpc: '2.0', method: 'session/prompt', params: { sessionId, message } }); return { ok: true } },
    permissionDecision(sessionId: string, requestId: string, allowed: boolean) { send(sessionId, { jsonrpc: '2.0', method: 'session/permission', params: { sessionId, requestId, allowed } }); return { ok: true } },
    interrupt(sessionId: string) { send(sessionId, { jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } }); return { ok: true } },
    terminate(sessionId: string) { const child = sessions.get(sessionId); if (child) child.kill(); else managedSessions.delete(sessionId); sessions.delete(sessionId); return { ok: true } },
    onEvent(sessionId: string, listener: (event: unknown) => void) {
      const sessionListeners = listeners.get(sessionId) ?? new Set<(event: unknown) => void>()
      sessionListeners.add(listener)
      listeners.set(sessionId, sessionListeners)
      return () => { sessionListeners.delete(listener); if (!sessionListeners.size) listeners.delete(sessionId) }
    },
    markManaged(sessionId: string) { managedSessions.add(sessionId) },
    isManaged(sessionId: string) { return managedSessions.has(sessionId) },
    hasSession(sessionId: string) { return sessions.has(sessionId) },
  }
}

export type DesktopAgentRuntime = ReturnType<typeof createDesktopAgentRuntime>

function parseAcpEvent(value: unknown): AcpEvent | null {
  if (!value || typeof value !== 'object') return null
  const event = value as { type?: unknown; state?: unknown }
  if (event.type === 'state' && ['starting', 'running', 'interrupted', 'terminated', 'error'].includes(String(event.state))) return value as AcpEvent
  if (['message', 'tool_request', 'permission_request', 'artifact', 'usage', 'error'].includes(String(event.type))) return value as AcpEvent
  return null
}

function createDesktopAcpSession(runtime: DesktopAgentRuntime, provider: AcpProvider, sessionId: string): AcpSession {
  let state: AcpSessionState = 'starting'
  const events: AcpEvent[] = []
  const listeners = new Set<(event: AcpEvent) => void>()
  runtime.onEvent(sessionId, (value) => {
    const event = parseAcpEvent(value)
    if (!event) return
    if (event.type === 'state') state = event.state
    else if (event.type === 'error' && !event.error.recoverable) state = 'error'
    events.push(event)
    for (const listener of listeners) listener(event)
  })
  return {
    id: sessionId,
    provider,
    get state() { return state },
    async input(message) { runtime.input(sessionId, message) },
    async decidePermission(requestId, allowed) { runtime.permissionDecision(sessionId, requestId, allowed) },
    async interrupt() { runtime.interrupt(sessionId) },
    async terminate() { runtime.terminate(sessionId) },
    onEvent(listener, options = {}) {
      listeners.add(listener)
      if (options.replay) events.forEach(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function createDesktopAcpProviderAdapters(runtime: DesktopAgentRuntime): Record<AcpProvider, AcpProviderAdapter> {
  return Object.fromEntries((['codex', 'claude'] as const).map((provider) => {
    const adapter: AcpProviderAdapter = {
      provider,
      async discover() { return runtime.discover().then((items) => items.find((item) => item.provider === provider)!) },
      async launch(options: AcpLaunchOptions) {
        runtime.markManaged(options.sessionId)
        const session = createDesktopAcpSession(runtime, provider, options.sessionId)
        runtime.launch({ provider, sessionId: options.sessionId, profileId: options.profileId, cwd: options.cwd })
        return session
      },
      async reconnect(sessionId: string) {
        if (!runtime.hasSession(sessionId)) throw new Error(`Agent session ${sessionId} is not running`)
        return createDesktopAcpSession(runtime, provider, sessionId)
      },
    }
    return [provider, adapter]
  })) as Record<AcpProvider, AcpProviderAdapter>
}

export function registerAgentRuntimeIpc(ipc: { handle(channel: string, listener: (_event: unknown, ...args: any[]) => unknown): unknown }, emit: (sessionId: string, event: unknown) => void) {
  const runtime = createDesktopAgentRuntime(emit)
  ipc.handle('scriptmanager:agents:discover', () => runtime.discover())
  ipc.handle('scriptmanager:agents:launch', (_event, payload: DesktopAgentLaunch) => runtime.launch(payload))
  ipc.handle('scriptmanager:agents:input', (_event, payload: { sessionId: string; message: unknown }) => runtime.input(payload.sessionId, payload.message))
  ipc.handle('scriptmanager:agents:permission', (_event, payload: { sessionId: string; requestId: string; allowed: boolean }) => runtime.permissionDecision(payload.sessionId, payload.requestId, payload.allowed))
  ipc.handle('scriptmanager:agents:interrupt', (_event, sessionId: string) => runtime.interrupt(sessionId))
  ipc.handle('scriptmanager:agents:terminate', (_event, sessionId: string) => runtime.terminate(sessionId))
  return runtime
}
