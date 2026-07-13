import type { AcpEvent, AcpEventSubscriptionOptions, AcpLaunchOptions, AcpMessage, AcpProvider, AcpProviderAdapter, AcpSession, AcpSessionState } from './types'

class FakeSession implements AcpSession {
  state: AcpSessionState = 'running'
  readonly events: AcpEvent[] = []
  readonly sent: AcpMessage[] = []
  private listeners = new Set<(event: AcpEvent) => void>()

  constructor(readonly id: string, readonly provider: AcpProvider, private readonly replayAfter = 0) {}
  async input(message: AcpMessage) { if (this.state === 'terminated') throw new Error('ACP session is terminated'); this.sent.push(message) }
  async decidePermission(requestId: string, allowed: boolean) { await this.input({ role: 'tool', content: JSON.stringify({ requestId, allowed }) }) }
  async interrupt() { if (this.state !== 'terminated') this.state = 'interrupted' }
  async terminate() { this.state = 'terminated'; this.listeners.clear() }
  onEvent(listener: (event: AcpEvent) => void, options: AcpEventSubscriptionOptions = {}) {
    this.listeners.add(listener)
    if (options.replay) this.events.slice(this.replayAfter).forEach(listener)
    return () => this.listeners.delete(listener)
  }
  async emit(event: AcpEvent) { this.events.push(event); if (event.type === 'error' && !event.error.recoverable) this.state = 'error'; await Promise.all([...this.listeners].map((listener) => listener(event))) }
}

export class FakeAcpProviderAdapter implements AcpProviderAdapter {
  private readonly sessions = new Map<string, FakeSession>()
  constructor(readonly provider: AcpProvider) {}
  async discover() { return { provider: this.provider, available: true, executable: `${this.provider}.cmd`, version: 'test' } }
  async launch(options: AcpLaunchOptions) { const session = new FakeSession(options.sessionId, this.provider); this.sessions.set(options.sessionId, session); return session }
  async reconnect(sessionId: string, afterEvent = 0) {
    const existing = this.sessions.get(sessionId)
    if (!existing) throw new Error(`ACP session ${sessionId} not found`)
    const view = new FakeSession(existing.id, existing.provider, afterEvent)
    view.events.push(...existing.events); view.sent.push(...existing.sent); view.state = existing.state
    return view
  }
  async emit(sessionId: string, event: AcpEvent) { const session = this.sessions.get(sessionId); if (!session) throw new Error(`ACP session ${sessionId} not found`); await session.emit(event) }
  inputs(sessionId: string) { return [...(this.sessions.get(sessionId)?.sent ?? [])] }
}
