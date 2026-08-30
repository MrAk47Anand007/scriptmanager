import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import readline from 'node:readline'
import type {
  AcpEvent,
  AcpEventSubscriptionOptions,
  AcpLaunchOptions,
  AcpMessage,
  AcpProvider,
  AcpProviderAdapter,
  AcpSession,
  AcpSessionState,
} from '../src/lib/agents/types'

export type DesktopAgentProvider = 'codex' | 'claude'
export interface DesktopAgentLaunch {
  provider: DesktopAgentProvider
  sessionId: string
  profileId: string
  cwd: string
  environment?: Record<string, string>
}

const PROVIDERS = {
  codex: { provider: 'codex' as const, executable: 'codex-acp', args: [] as string[] },
  claude: { provider: 'claude' as const, executable: 'claude-agent-acp', args: [] as string[] },
}

type JsonRpcId = string | number
type JsonRpcMessage = Record<string, unknown>
type PendingRequest = {
  method: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer?: ReturnType<typeof setTimeout>
}
type PermissionRequest = {
  rpcId: JsonRpcId
  options: Array<Record<string, unknown>>
}
type AgentProcess = {
  sessionId: string
  provider: DesktopAgentProvider
  child: ChildProcessWithoutNullStreams
  protocolSessionId?: string
  nextRequestId: number
  state: AcpSessionState
  pending: Map<string, PendingRequest>
  permissions: Map<string, PermissionRequest>
  closed: boolean
}

const SESSION_STATES: AcpSessionState[] = ['starting', 'running', 'interrupted', 'succeeded', 'terminated', 'error']

export function getAgentProviderSpec(provider: DesktopAgentProvider) {
  const spec = PROVIDERS[provider]
  if (!spec) throw new Error(`Unsupported agent provider: ${provider}`)
  return spec
}

export function validateAgentLaunch(payload: DesktopAgentLaunch) {
  getAgentProviderSpec(payload.provider)
  if (!payload.sessionId?.trim() || !payload.profileId?.trim() || !payload.cwd?.trim()) {
    throw new Error('Agent launch requires sessionId, profileId, and cwd')
  }
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return (typeof value === 'string' && value.length > 0) || (typeof value === 'number' && Number.isFinite(value))
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function errorFrom(value: unknown, fallback = 'ACP provider request failed') {
  if (value instanceof Error) return value
  if (isRecord(value) && typeof value.message === 'string') return new Error(value.message)
  return new Error(typeof value === 'string' ? value : fallback)
}

function protocolError(message: JsonRpcMessage) {
  const error = isRecord(message.error) ? message.error : {}
  const code = typeof error.code === 'number' ? error.code : -32000
  const detail = typeof error.message === 'string' ? error.message : 'ACP provider returned an error'
  const result = new Error(`${detail} (code ${code})`)
  Object.assign(result, { code, data: error.data })
  return result
}

function stateFromStopReason(stopReason: unknown): AcpSessionState {
  return stopReason === 'cancelled' ? 'interrupted' : 'succeeded'
}

function resourceFromToolCall(toolCall: Record<string, unknown>, id: string) {
  const rawInput = isRecord(toolCall.rawInput) ? toolCall.rawInput : {}
  for (const key of ['path', 'filePath', 'file', 'command', 'url', 'resource']) {
    const value = stringValue(rawInput[key])
    if (value) return value
  }
  const content = Array.isArray(toolCall.content) ? toolCall.content : []
  for (const item of content) {
    if (!isRecord(item)) continue
    const value = stringValue(item.path) ?? stringValue(isRecord(item.diff) ? item.diff.path : undefined)
    if (value) return value
  }
  return stringValue(toolCall.title) ?? id
}

function capabilityFromToolKind(kind: unknown) {
  if (kind === 'execute') return 'command.execute'
  if (kind === 'edit' || kind === 'delete' || kind === 'move') return 'file.write'
  if (kind === 'read') return 'file.read'
  if (kind === 'search' || kind === 'fetch') return 'workspace.inspect'
  return 'command.execute'
}

function normalizePermission(message: JsonRpcMessage): { request: Extract<AcpEvent, { type: 'permission_request' }>; options: Array<Record<string, unknown>> } | null {
  const params = isRecord(message.params) ? message.params : null
  const toolCall = params && isRecord(params.toolCall) ? params.toolCall : null
  if (!params || !toolCall || !isJsonRpcId(message.id)) return null
  const id = stringValue(toolCall.toolCallId) ?? String(message.id)
  const kind = toolCall.kind
  const operation = stringValue(toolCall.title) ?? (typeof kind === 'string' ? kind : 'Agent tool call')
  const reason = isRecord(params._meta) && isRecord(params._meta.permission)
    ? stringValue(params._meta.permission.description)
    : undefined
  const options = Array.isArray(params.options) ? params.options.filter(isRecord) : []
  return {
    request: {
      type: 'permission_request',
      request: {
        id,
        capability: capabilityFromToolKind(kind),
        operation,
        resource: resourceFromToolCall(toolCall, id),
        protectedAction: false,
        reason,
        preview: {
          title: toolCall.title,
          kind,
          rawInput: toolCall.rawInput,
          content: toolCall.content,
          locations: toolCall.locations,
          options,
        },
      },
    },
    options,
  }
}

function textFromContent(value: unknown) {
  if (!isRecord(value) || value.type !== 'text') return undefined
  return typeof value.text === 'string' ? value.text : undefined
}

function normalizeUpdate(params: Record<string, unknown>): AcpEvent | null {
  const update = isRecord(params.update) ? params.update : null
  if (!update) return null
  const kind = update.sessionUpdate
  if (kind === 'agent_message_chunk') {
    const content = textFromContent(update.content)
    if (content === undefined) return null
    return { type: 'message', message: { role: 'assistant', content } }
  }
  if (kind === 'tool_call') {
    const id = stringValue(update.toolCallId)
    if (!id) return null
    return {
      type: 'tool_request',
      request: {
        id,
        name: stringValue(update.title) ?? stringValue(update.kind) ?? 'tool',
        arguments: isRecord(update.rawInput) ? update.rawInput : {},
      },
    }
  }
  if (kind === 'usage_update') {
    const inputTokens = typeof update.used === 'number' ? update.used : typeof update.inputTokens === 'number' ? update.inputTokens : undefined
    const outputTokens = typeof update.outputTokens === 'number' ? update.outputTokens : undefined
    return { type: 'usage', usage: { ...(inputTokens === undefined ? {} : { inputTokens }), ...(outputTokens === undefined ? {} : { outputTokens }) } }
  }
  if (kind === 'tool_call_update' && Array.isArray(update.content)) {
    const diff = update.content.find((item) => isRecord(item) && item.type === 'diff')
    if (isRecord(diff)) {
      const name = stringValue(diff.path) ?? stringValue(update.toolCallId) ?? 'agent-change.diff'
      return {
        type: 'artifact',
        artifact: {
          id: stringValue(update.toolCallId) ?? name,
          kind: 'diff',
          name,
          content: JSON.stringify({ oldText: diff.oldText, newText: diff.newText }),
        },
      }
    }
  }
  return null
}

function parseAcpEvent(value: unknown): AcpEvent | null {
  if (!isRecord(value)) return null
  if (value.type === 'state' && SESSION_STATES.includes(value.state as AcpSessionState)) return value as AcpEvent
  if (['message', 'tool_request', 'permission_request', 'artifact', 'usage', 'error'].includes(String(value.type))) return value as AcpEvent
  return null
}

function choosePermissionOption(options: Array<Record<string, unknown>>, allowed: boolean) {
  const acceptedKinds = ['allow_once', 'allow_always', 'allow_persistent']
  const rejectedKinds = ['reject_once', 'reject_always']
  const kinds = allowed ? acceptedKinds : rejectedKinds
  const selected = options.find((option) => typeof option.kind === 'string' && kinds.includes(option.kind))
  if (selected && isJsonRpcId(selected.optionId)) return { outcome: 'selected', optionId: selected.optionId }
  if (selected && typeof selected.optionId === 'string') return { outcome: 'selected', optionId: selected.optionId }
  return { outcome: 'cancelled' }
}

export function createDesktopAgentRuntime(emit: (sessionId: string, event: unknown) => void, options: { requestTimeoutMs?: number } = {}) {
  const requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 30_000)
  const sessions = new Map<string, AgentProcess>()
  const histories = new Map<string, unknown[]>()
  const listeners = new Map<string, Set<(event: unknown) => void>>()
  const managedSessions = new Set<string>()

  const publish = (sessionId: string, event: unknown) => {
    const history = histories.get(sessionId) ?? []
    history.push(event)
    if (history.length > 1_000) history.shift()
    histories.set(sessionId, history)
    const processState = sessions.get(sessionId)
    if (processState && isRecord(event) && event.type === 'state' && SESSION_STATES.includes(event.state as AcpSessionState)) {
      processState.state = event.state as AcpSessionState
    }
    try { emit(sessionId, event) } catch { /* Event forwarding must not break the provider transport. */ }
    for (const listener of listeners.get(sessionId) ?? []) {
      try { listener(event) } catch { /* One consumer must not stop other session listeners. */ }
    }
  }

  const sendToChild = (processState: AgentProcess, value: JsonRpcMessage) => {
    if (processState.closed || processState.child.killed || processState.child.stdin.writable === false) {
      throw new Error(`Agent session ${processState.sessionId} is not running`)
    }
    processState.child.stdin.write(`${JSON.stringify(value)}\n`)
  }

  const rejectPending = (processState: AgentProcess, error: Error) => {
    for (const pending of processState.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer)
      pending.reject(error)
    }
    processState.pending.clear()
  }

  const disposeProcess = (processState: AgentProcess, terminalEvent?: unknown) => {
    if (processState.closed) return
    processState.closed = true
    sessions.delete(processState.sessionId)
    rejectPending(processState, new Error(`Agent session ${processState.sessionId} is no longer available`))
    processState.permissions.clear()
    if (terminalEvent) publish(processState.sessionId, terminalEvent)
    managedSessions.delete(processState.sessionId)
    listeners.delete(processState.sessionId)
  }

  const respondError = (processState: AgentProcess, id: JsonRpcId, code: number, message: string) => {
    try { sendToChild(processState, { jsonrpc: '2.0', id, error: { code, message } }) } catch { /* The child may have exited while handling the request. */ }
  }

  const sendRequest = (processState: AgentProcess, method: string, params: unknown) => {
    const id = processState.nextRequestId++
    return new Promise<unknown>((resolve, reject) => {
      const pending: PendingRequest = { method, resolve, reject }
      processState.pending.set(String(id), pending)
      if (method === 'initialize' || method === 'session/new') {
        pending.timer = setTimeout(() => {
          if (!processState.pending.delete(String(id))) return
          reject(new Error(`ACP request ${method} timed out after ${requestTimeoutMs}ms`))
        }, requestTimeoutMs)
      }
      try {
        sendToChild(processState, { jsonrpc: '2.0', id, method, params })
      } catch (error) {
        if (pending.timer) clearTimeout(pending.timer)
        processState.pending.delete(String(id))
        reject(errorFrom(error))
      }
    })
  }

  const handleResponse = (processState: AgentProcess, message: JsonRpcMessage) => {
    if (!isJsonRpcId(message.id)) return
    const pending = processState.pending.get(String(message.id))
    if (!pending) return
    processState.pending.delete(String(message.id))
    if (pending.timer) clearTimeout(pending.timer)
    if (message.error !== undefined) {
      pending.reject(protocolError(message))
      return
    }
    pending.resolve(message.result)
    if (pending.method === 'session/prompt') {
      const result = isRecord(message.result) ? message.result : {}
      publish(processState.sessionId, { type: 'state', state: stateFromStopReason(result.stopReason) })
    }
  }

  const handleRequest = (processState: AgentProcess, message: JsonRpcMessage) => {
    if (message.method === 'session/update') {
      const params = isRecord(message.params) ? message.params : {}
      const event = normalizeUpdate(params)
      if (event) publish(processState.sessionId, event)
      return
    }
    if (message.method === 'session/request_permission') {
      const normalized = normalizePermission(message)
      if (!normalized || !isJsonRpcId(message.id)) {
        if (isJsonRpcId(message.id)) respondError(processState, message.id, -32602, 'Invalid ACP permission request')
        return
      }
      processState.permissions.set(normalized.request.request.id, { rpcId: message.id, options: normalized.options })
      publish(processState.sessionId, normalized.request)
      return
    }
    if (isJsonRpcId(message.id)) respondError(processState, message.id, -32601, `Unsupported ACP client method: ${String(message.method)}`)
  }

  const handleLine = (processState: AgentProcess, line: string) => {
    let message: unknown
    try { message = JSON.parse(line) } catch {
      publish(processState.sessionId, { type: 'error', error: { code: 'invalid_protocol_message', message: 'ACP provider emitted invalid JSON', recoverable: false } })
      try { processState.child.kill() } catch { /* The process may have already exited. */ }
      disposeProcess(processState, { type: 'state', state: 'error' })
      return
    }
    if (!isRecord(message)) return
    if (message.jsonrpc === '2.0' && message.method !== undefined) {
      handleRequest(processState, message)
      return
    }
    if (message.jsonrpc === '2.0' && (message.result !== undefined || message.error !== undefined)) {
      handleResponse(processState, message)
      return
    }
    // Preserve compatibility with the normalized event shape used by the fake adapter.
    if (message.type !== undefined) publish(processState.sessionId, message)
  }

  return {
    async discover() {
      return Promise.all((Object.keys(PROVIDERS) as DesktopAgentProvider[]).map(async (provider) => new Promise<{ provider: DesktopAgentProvider; available: boolean; executable: string; version?: string }>((resolve) => {
        const spec = getAgentProviderSpec(provider)
        const child = spawn(spec.executable, ['--version'], { windowsHide: true })
        let output = ''
        child.stdout.on('data', (chunk) => { output += chunk.toString() })
        child.on('error', () => resolve({ provider, available: false, executable: spec.executable }))
        child.on('close', (code) => resolve({ provider, available: code === 0, executable: spec.executable, version: output.trim() || undefined }))
      })))
    },
    async launch(payload: DesktopAgentLaunch) {
      validateAgentLaunch(payload)
      if (sessions.has(payload.sessionId)) throw new Error(`Agent session ${payload.sessionId} already exists`)
      const spec = getAgentProviderSpec(payload.provider)
      const child = spawn(spec.executable, spec.args, {
        cwd: payload.cwd,
        env: { ...process.env, ...payload.environment },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const processState: AgentProcess = {
        sessionId: payload.sessionId,
        provider: payload.provider,
        child,
        nextRequestId: 1,
        state: 'starting',
        pending: new Map(),
        permissions: new Map(),
        closed: false,
      }
      sessions.set(payload.sessionId, processState)
      histories.set(payload.sessionId, [])
      readline.createInterface({ input: child.stdout }).on('line', (line) => handleLine(processState, line))
      child.stderr.on('data', (chunk) => publish(payload.sessionId, { type: 'error', error: { code: 'provider_stderr', message: chunk.toString(), recoverable: true } }))
      child.on('exit', (code, signal) => {
        if (processState.closed) return
        if (code === 0) disposeProcess(processState, { type: 'state', state: 'terminated', code, signal })
        else {
          publish(payload.sessionId, { type: 'error', error: { code: 'provider_exit', message: `ACP provider exited with code ${code ?? 'unknown'}`, recoverable: false } })
          disposeProcess(processState, { type: 'state', state: 'error', code, signal })
        }
      })
      child.on('error', (error) => {
        if (processState.closed) return
        publish(payload.sessionId, { type: 'error', error: { code: 'launch_failed', message: error.message, recoverable: false } })
        disposeProcess(processState, { type: 'state', state: 'error' })
      })

      try {
        const initialize = await sendRequest(processState, 'initialize', {
          protocolVersion: 1,
          clientInfo: { name: 'ScriptManager', version: '0.1.0' },
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        })
        if (!isRecord(initialize) || initialize.protocolVersion !== 1) throw new Error('ACP provider did not negotiate protocol version 1')
        const created = await sendRequest(processState, 'session/new', { cwd: payload.cwd, mcpServers: [] })
        if (!isRecord(created) || typeof created.sessionId !== 'string' || !created.sessionId.trim()) throw new Error('ACP provider returned no session ID')
        processState.protocolSessionId = created.sessionId
        publish(payload.sessionId, { type: 'state', state: 'running' })
        return { sessionId: payload.sessionId, provider: payload.provider }
      } catch (error) {
        if (!processState.closed) {
          publish(payload.sessionId, { type: 'error', error: { code: 'handshake_failed', message: errorFrom(error).message, recoverable: false } })
          try { child.kill() } catch { /* The process may have already exited. */ }
          disposeProcess(processState)
        }
        throw errorFrom(error, 'ACP provider handshake failed')
      }
    },
    async input(sessionId: string, message: unknown) {
      const processState = sessions.get(sessionId)
      if (!processState?.protocolSessionId) throw new Error(`Agent session ${sessionId} is not running`)
      publish(sessionId, { type: 'state', state: 'running' })
      const content = isRecord(message) && typeof message.content === 'string' ? message.content : String(message)
      void sendRequest(processState, 'session/prompt', {
        sessionId: processState.protocolSessionId,
        prompt: [{ type: 'text', text: content }],
      }).catch((error) => publish(sessionId, { type: 'error', error: { code: 'prompt_failed', message: errorFrom(error).message, recoverable: false } }))
      return { ok: true }
    },
    async permissionDecision(sessionId: string, requestId: string, allowed: boolean) {
      const processState = sessions.get(sessionId)
      const request = processState?.permissions.get(requestId)
      if (!processState || !request) throw new Error(`Agent permission request ${requestId} is no longer available`)
      processState.permissions.delete(requestId)
      sendToChild(processState, { jsonrpc: '2.0', id: request.rpcId, result: { outcome: choosePermissionOption(request.options, allowed) } })
      return { ok: true }
    },
    async interrupt(sessionId: string) {
      const processState = sessions.get(sessionId)
      if (!processState?.protocolSessionId) throw new Error(`Agent session ${sessionId} is not running`)
      publish(sessionId, { type: 'state', state: 'interrupted' })
      void sendRequest(processState, 'session/cancel', { sessionId: processState.protocolSessionId }).catch((error) => publish(sessionId, { type: 'error', error: { code: 'cancel_failed', message: errorFrom(error).message, recoverable: false } }))
      return { ok: true }
    },
    async terminate(sessionId: string) {
      const processState = sessions.get(sessionId)
      if (processState) {
        try { processState.child.kill() } catch { /* The process may have already exited. */ }
        disposeProcess(processState, { type: 'state', state: 'terminated' })
      } else managedSessions.delete(sessionId)
      return { ok: true }
    },
    onEvent(sessionId: string, listener: (event: unknown) => void, options: AcpEventSubscriptionOptions = {}) {
      const sessionListeners = listeners.get(sessionId) ?? new Set<(event: unknown) => void>()
      sessionListeners.add(listener)
      listeners.set(sessionId, sessionListeners)
      if (options.replay) for (const event of histories.get(sessionId) ?? []) listener(event)
      return () => {
        sessionListeners.delete(listener)
        if (!sessionListeners.size) listeners.delete(sessionId)
      }
    },
    markManaged(sessionId: string) { managedSessions.add(sessionId) },
    isManaged(sessionId: string) { return managedSessions.has(sessionId) },
    hasSession(sessionId: string) { return sessions.has(sessionId) },
    getState(sessionId: string) { return sessions.get(sessionId)?.state ?? 'starting' as AcpSessionState },
  }
}

export type DesktopAgentRuntime = ReturnType<typeof createDesktopAgentRuntime>

function createDesktopAcpSession(runtime: DesktopAgentRuntime, provider: AcpProvider, sessionId: string, replay = false): AcpSession {
  let state: AcpSessionState = runtime.getState(sessionId)
  const events: AcpEvent[] = []
  const listeners = new Set<(event: AcpEvent) => void>()
  runtime.onEvent(sessionId, (value) => {
    const event = parseAcpEvent(value)
    if (!event) return
    if (event.type === 'state') state = event.state
    else if (event.type === 'error' && !event.error.recoverable) state = 'error'
    events.push(event)
    for (const listener of listeners) listener(event)
  }, { replay })
  return {
    id: sessionId,
    provider,
    get state() { return state },
    async input(message: AcpMessage) {
      if (state === 'terminated' || state === 'error') throw new Error(`ACP session is ${state}`)
      await runtime.input(sessionId, message)
    },
    async decidePermission(requestId, allowed) { await runtime.permissionDecision(sessionId, requestId, allowed) },
    async interrupt() { await runtime.interrupt(sessionId) },
    async terminate() { await runtime.terminate(sessionId) },
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
        await runtime.launch({ provider, sessionId: options.sessionId, profileId: options.profileId, cwd: options.cwd, environment: options.environment })
        return session
      },
      async reconnect(sessionId: string) {
        if (!runtime.hasSession(sessionId)) throw new Error(`Agent session ${sessionId} is not running`)
        return createDesktopAcpSession(runtime, provider, sessionId, true)
      },
    }
    return [provider, adapter]
  })) as Record<AcpProvider, AcpProviderAdapter>
}

type DesktopAgentServiceController = {
  launch(input: { profileId: string; prompt: string; cwd: string; desktopHost: boolean; workspaceId: string }): Promise<unknown>
  interrupt(runId: string, workspaceId: string): Promise<unknown>
  resume(runId: string, prompt: string, workspaceId: string): Promise<unknown>
  terminate(runId: string, workspaceId: string): Promise<unknown>
}

function requiredAgentString(payload: unknown, key: string) {
  if (!isRecord(payload) || typeof payload[key] !== 'string' || !payload[key].trim()) throw new Error(`${key} is required`)
  return payload[key].trim()
}

export function registerAgentServiceIpc(
  ipc: { handle(channel: string, listener: (_event: unknown, ...args: any[]) => unknown): unknown },
  service: DesktopAgentServiceController,
  getWorkspaceId: () => Promise<string>,
) {
  ipc.handle('scriptmanager:agents:run', async (_event, payload: unknown) => {
    const profileId = requiredAgentString(payload, 'profileId')
    const prompt = requiredAgentString(payload, 'prompt')
    const cwd = requiredAgentString(payload, 'cwd')
    return service.launch({ profileId, prompt, cwd, desktopHost: true, workspaceId: await getWorkspaceId() })
  })
  ipc.handle('scriptmanager:agents:run-interrupt', async (_event, runId: unknown) => service.interrupt(requiredAgentString({ runId }, 'runId'), await getWorkspaceId()))
  ipc.handle('scriptmanager:agents:run-resume', async (_event, payload: unknown) => service.resume(requiredAgentString(payload, 'runId'), requiredAgentString(payload, 'prompt'), await getWorkspaceId()))
  ipc.handle('scriptmanager:agents:run-terminate', async (_event, runId: unknown) => service.terminate(requiredAgentString({ runId }, 'runId'), await getWorkspaceId()))
}
