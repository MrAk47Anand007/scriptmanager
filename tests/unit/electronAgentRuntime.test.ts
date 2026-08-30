import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { createDesktopAcpProviderAdapters, createDesktopAgentRuntime } from '../../electron/agentRuntime'

function childProcess() {
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: { write: ReturnType<typeof vi.fn> }; killed: boolean }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = { write: vi.fn() }
  child.killed = false
  spawnMock.mockReturnValue(child)
  return child
}

afterEach(() => vi.clearAllMocks())

describe('electron ACP runtime bridge', () => {
  it('forwards provider events and exposes terminal state to ACP sessions', async () => {
    const child = childProcess()
    const emitted: unknown[] = []
    const runtime = createDesktopAgentRuntime((_sessionId, event) => emitted.push(event))
    const session = await createDesktopAcpProviderAdapters(runtime).codex.launch({ sessionId: 'run-1', profileId: 'profile-1', cwd: '/tmp' })
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
