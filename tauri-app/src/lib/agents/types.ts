export type AcpProvider = 'codex' | 'claude'
export type AcpSessionState = 'starting' | 'running' | 'interrupted' | 'succeeded' | 'terminated' | 'error'

export interface AcpMessage { id?: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; createdAt?: string }
export interface AcpToolRequest { id: string; name: string; arguments: Record<string, unknown> }
export interface AcpPermissionRequest { id: string; capability: string; operation: string; resource: string; protectedAction: boolean; reason?: string; preview?: unknown }
export interface AcpUsage { inputTokens?: number; outputTokens?: number; cachedTokens?: number; costUsd?: number; model?: string }
export interface AcpArtifact { id: string; kind: string; name: string; content?: string; path?: string; metadata?: Record<string, unknown> }
export interface AcpError { code: string; message: string; recoverable: boolean }

export type AcpEvent =
  | { type: 'message'; message: AcpMessage }
  | { type: 'tool_request'; request: AcpToolRequest }
  | { type: 'permission_request'; request: AcpPermissionRequest }
  | { type: 'artifact'; artifact: AcpArtifact }
  | { type: 'usage'; usage: AcpUsage }
  | { type: 'error'; error: AcpError }
  | { type: 'state'; state: AcpSessionState }

export interface AcpLaunchOptions { sessionId: string; cwd: string; profileId: string; model?: string; environment?: Record<string, string> }
export interface AcpDiscovery { provider: AcpProvider; available: boolean; executable?: string; version?: string; error?: string }
export interface AcpEventSubscriptionOptions { replay?: boolean }
export interface AcpSession {
  readonly id: string
  readonly provider: AcpProvider
  readonly state: AcpSessionState
  input(message: AcpMessage): Promise<void>
  decidePermission(requestId: string, allowed: boolean): Promise<void>
  interrupt(): Promise<void>
  terminate(): Promise<void>
  onEvent(listener: (event: AcpEvent) => void, options?: AcpEventSubscriptionOptions): () => void
}
export interface AcpProviderAdapter {
  readonly provider: AcpProvider
  discover(): Promise<AcpDiscovery>
  launch(options: AcpLaunchOptions): Promise<AcpSession>
  reconnect(sessionId: string, afterEvent?: number): Promise<AcpSession>
}
