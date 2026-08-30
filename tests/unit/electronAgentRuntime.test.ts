import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { createDesktopAcpProviderAdapters, createDesktopAgentRuntime, registerAgentServiceIpc } from '../../electron/agentRuntime'

function childProcess() {
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: { write: ReturnType<typeof vi.fn> }; kill: ReturnType<typeof vi.fn>; killed: boolean }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = { write: vi.fn() }
  child.kill = vi.fn()
  child.killed = false
  spawnMock.mockReturnValue(child)
  return child
}

async function completeHandshake(child: ReturnType<typeof childProcess>, emit: (sessionId: string, event: unknown) => void = () => {}) {
  const rawRuntime = createDesktopAgentRuntime(emit)
  const runtime = createDesktopAcpProviderAdapters(rawRuntime).codex
  const launching = runtime.launch({ sessionId: 'run-1', profileId: 'profile-1', cwd: '/tmp' })

  await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledTimes(1))
  expect(JSON.parse(child.stdin.write.mock.calls[0][0])).toMatchObject({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: 1 },
  })
  child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1 } }) + '\n')

  await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledTimes(2))
  expect(JSON.parse(child.stdin.write.mock.calls[1][0])).toMatchObject({
    jsonrpc: '2.0',
    id: 2,
    method: 'session/new',
    params: { cwd: '/tmp', mcpServers: [] },
  })
  child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { sessionId: 'provider-session-1' } }) + '\n')

  return { session: await launching, runtime, rawRuntime }
}

afterEach(() => vi.clearAllMocks())

describe('electron ACP runtime bridge', () => {
  it('routes desktop agent controls through the durable agent service', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const service = {
      discover: vi.fn().mockResolvedValue([{ provider: 'codex', available: true }]),
      launch: vi.fn().mockResolvedValue({ id: 'run-1' }),
      interrupt: vi.fn().mockResolvedValue({ id: 'run-1' }),
      resume: vi.fn().mockResolvedValue({ id: 'run-1' }),
      terminate: vi.fn().mockResolvedValue({ id: 'run-1' }),
    }
    registerAgentServiceIpc(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      service,
      async () => 'workspace-1',
    )

    await expect(handlers.get('scriptmanager:agents:discover')?.({})).resolves.toEqual([{ provider: 'codex', available: true }])
    await expect(handlers.get('scriptmanager:agents:run')?.({}, { profileId: 'profile-1', prompt: 'inspect', cwd: '/tmp' })).resolves.toEqual({ id: 'run-1' })
    expect(service.launch).toHaveBeenCalledWith({ profileId: 'profile-1', prompt: 'inspect', cwd: '/tmp', desktopHost: true, workspaceId: 'workspace-1' })
    await handlers.get('scriptmanager:agents:run-interrupt')?.({}, 'run-1')
    await handlers.get('scriptmanager:agents:run-resume')?.({}, { runId: 'run-1', prompt: 'continue' })
    await handlers.get('scriptmanager:agents:run-terminate')?.({}, 'run-1')
    expect(service.interrupt).toHaveBeenCalledWith('run-1', 'workspace-1')
    expect(service.resume).toHaveBeenCalledWith('run-1', 'continue', 'workspace-1')
    expect(service.terminate).toHaveBeenCalledWith('run-1', 'workspace-1')
  })

  it('fails a provider launch when the ACP handshake times out', async () => {
    const child = childProcess()
    const runtimeFactory = createDesktopAgentRuntime as unknown as (emit: (sessionId: string, event: unknown) => void, options: { requestTimeoutMs: number }) => ReturnType<typeof createDesktopAgentRuntime>
    const runtime = runtimeFactory(() => {}, { requestTimeoutMs: 10 })

    await expect(runtime.launch({ provider: 'codex', sessionId: 'run-timeout', profileId: 'profile-1', cwd: '/tmp' })).rejects.toThrow('timed out')
    expect(child.kill).toHaveBeenCalled()
  })

  it('awaits the ACP handshake and sends prompts to the negotiated session', async () => {
    const child = childProcess()
    const { session } = await completeHandshake(child)

    await session.input({ role: 'user', content: 'inspect the repository' })
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledTimes(3))
    expect(JSON.parse(child.stdin.write.mock.calls[2][0])).toMatchObject({
      jsonrpc: '2.0',
      id: 3,
      method: 'session/prompt',
      params: {
        sessionId: 'provider-session-1',
        prompt: [{ type: 'text', text: 'inspect the repository' }],
      },
    })

    child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 3, result: { stopReason: 'end_turn' } }) + '\n')
    await vi.waitFor(() => expect(session.state).toBe('succeeded'))
  })

  it('normalizes standard updates and responds to permission requests by RPC id', async () => {
    const child = childProcess()
    const { session } = await completeHandshake(child)
    const received: unknown[] = []
    session.onEvent((event) => received.push(event))

    child.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'provider-session-1',
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hello' } },
      },
    }) + '\n')
    child.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 44,
      method: 'session/request_permission',
      params: {
        sessionId: 'provider-session-1',
        toolCall: { toolCallId: 'tool-1', kind: 'edit', title: 'Update README', rawInput: { path: 'README.md' } },
        options: [
          { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
        ],
      },
    }) + '\n')

    await vi.waitFor(() => expect(received).toHaveLength(2))
    expect(received[0]).toMatchObject({ type: 'message', message: { role: 'assistant', content: 'hello' } })
    expect(received[1]).toMatchObject({
      type: 'permission_request',
      request: { id: 'tool-1', capability: 'file.write', operation: 'Update README', resource: 'README.md' },
    })

    await session.decidePermission('tool-1', true)
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledTimes(3))
    expect(JSON.parse(child.stdin.write.mock.calls[2][0])).toMatchObject({
      jsonrpc: '2.0',
      id: 44,
      result: { outcome: { outcome: 'selected', optionId: 'allow-once' } },
    })
  })

  it('routes unknown ACP tool kinds through an approval-required capability', async () => {
    const child = childProcess()
    const { session } = await completeHandshake(child)
    const received: unknown[] = []
    session.onEvent((event) => received.push(event))

    child.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 45,
      method: 'session/request_permission',
      params: {
        sessionId: 'provider-session-1',
        toolCall: { toolCallId: 'tool-unknown', kind: 'other', title: 'Unclassified action', rawInput: {} },
        options: [{ optionId: 'reject-once', name: 'Reject', kind: 'reject_once' }],
      },
    }) + '\n')

    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(received[0]).toMatchObject({ type: 'permission_request', request: { capability: 'command.execute' } })
  })

  it('terminates a provider session after malformed ACP output', async () => {
    const child = childProcess()
    const { session, rawRuntime } = await completeHandshake(child)

    child.stdout.write('not-json\n')

    await vi.waitFor(() => expect(session.state).toBe('error'))
    expect(rawRuntime.hasSession('run-1')).toBe(false)
    expect(child.kill).toHaveBeenCalled()
  })

  it('forwards provider events and exposes terminal state to ACP sessions', async () => {
    const child = childProcess()
    const emitted: unknown[] = []
    const { session } = await completeHandshake(child, (_sessionId, event) => emitted.push(event))
    const received: unknown[] = []
    session.onEvent((event) => received.push(event))

    child.stdout.write('{"type":"message","message":{"role":"assistant","content":"done"}}\n')
    await vi.waitFor(() => expect(received).toHaveLength(1))
    child.emit('exit', 0, null)
    await vi.waitFor(() => expect(session.state).toBe('terminated'))

    expect(received[0]).toMatchObject({ type: 'message', message: { content: 'done' } })
    expect(emitted).toContainEqual(received[0])
    expect(child.stdin.write).toHaveBeenCalledWith(expect.stringContaining('"method":"initialize"'))
  })
})
