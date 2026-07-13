import { describe, expect, it } from 'vitest'
import { FakeAcpProviderAdapter } from '@/lib/agents/provider'

describe('ACP provider contract', () => {
  it('streams normalized messages, artifacts, permission requests, and usage', async () => {
    const adapter = new FakeAcpProviderAdapter('codex')
    expect(await adapter.discover()).toMatchObject({ provider: 'codex', available: true })
    const session = await adapter.launch({ sessionId: 's1', cwd: 'C:/workspace', profileId: 'p1' })
    const events: unknown[] = []
    session.onEvent((event) => events.push(event))

    await session.input({ role: 'user', content: 'inspect the repository' })
    await adapter.emit('s1', { type: 'message', message: { id: 'm1', role: 'assistant', content: 'ready', createdAt: '2026-07-13T00:00:00.000Z' } })
    await adapter.emit('s1', { type: 'artifact', artifact: { id: 'a1', kind: 'diff', name: 'change.patch', content: 'secret=[REDACTED]' } })
    await adapter.emit('s1', { type: 'permission_request', request: { id: 'r1', capability: 'file.write', operation: 'write', resource: 'src/a.ts', protectedAction: false } })
    await adapter.emit('s1', { type: 'usage', usage: { inputTokens: 10, outputTokens: 4, costUsd: 0.002 } })

    expect(events).toHaveLength(4)
    expect(session.state).toBe('running')
    expect(adapter.inputs('s1')).toEqual([{ role: 'user', content: 'inspect the repository' }])
  })

  it('supports errors, interruption, termination, and replay reconnect', async () => {
    const adapter = new FakeAcpProviderAdapter('claude')
    const session = await adapter.launch({ sessionId: 's2', cwd: 'C:/workspace', profileId: 'p2' })
    await adapter.emit('s2', { type: 'error', error: { code: 'provider_error', message: 'failed', recoverable: true } })
    const replayed: unknown[] = []
    const reconnected = await adapter.reconnect('s2', 0)
    reconnected.onEvent((event) => replayed.push(event), { replay: true })
    expect(replayed).toHaveLength(1)

    await session.interrupt()
    expect(session.state).toBe('interrupted')
    await session.terminate()
    expect(session.state).toBe('terminated')
    await expect(session.input({ role: 'user', content: 'again' })).rejects.toThrow('terminated')
  })
})
