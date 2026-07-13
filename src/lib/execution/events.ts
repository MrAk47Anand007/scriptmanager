import crypto from 'node:crypto'

export type ExecutionKind = 'script' | 'api' | 'remote' | 'workflow' | 'agent' | 'git'
export type ExecutionEventType =
  | 'execution.queued' | 'execution.started' | 'execution.output'
  | 'execution.succeeded' | 'execution.failed' | 'execution.cancelled'
  | 'execution.timed_out' | 'approval.requested' | 'approval.decided' | 'git.action'

export interface ExecutionActor {
  type: 'user' | 'system' | 'webhook' | 'schedule' | 'agent'
  id: string
  name?: string
}

export interface ExecutionTarget {
  type: 'script' | 'api_request' | 'remote_execution' | 'workflow' | 'agent_run' | 'project'
  id: string
  name?: string
}

export interface ExecutionEvent {
  readonly schemaVersion: 1
  readonly id: string
  readonly type: ExecutionEventType
  readonly executionKind: ExecutionKind
  readonly correlationId: string
  readonly occurredAt: string
  readonly actor: Readonly<ExecutionActor>
  readonly target: Readonly<ExecutionTarget>
  readonly data: Readonly<Record<string, unknown>>
}

export type CreateExecutionEventInput = Omit<ExecutionEvent, 'schemaVersion' | 'id' | 'occurredAt'>

const SENSITIVE_KEY = /^(authorization|cookie|password|passphrase|secret|token|api[-_]?key|access[-_]?key|private[-_]?key)$/i
const CREDENTIAL_IN_TEXT = /\b(token|password|secret|api[_-]?key)=([^\s&]+)/gi

export function createCorrelationId(): string {
  return `corr_${crypto.randomUUID()}`
}

export function createExecutionEvent(input: CreateExecutionEventInput): ExecutionEvent {
  return Object.freeze({
    schemaVersion: 1 as const,
    id: `evt_${crypto.randomUUID()}`,
    occurredAt: new Date().toISOString(),
    ...input,
    actor: Object.freeze({ ...input.actor }),
    target: Object.freeze({ ...input.target }),
    data: Object.freeze({ ...input.data }),
  })
}

function redactString(value: string, secrets: string[]): string {
  let redacted = value.replace(CREDENTIAL_IN_TEXT, '$1=[REDACTED]')
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
    redacted = redacted.split(secret).join('[REDACTED]')
  }
  return redacted
}

export function redactExecutionValue(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === 'string') return redactString(value, secrets)
  if (Array.isArray(value)) return value.map((item) => redactExecutionValue(item, secrets))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactExecutionValue(item, secrets),
    ]))
  }
  return value
}

export function serializeExecutionEvent(event: ExecutionEvent, secrets: string[] = []): string {
  return JSON.stringify(redactExecutionValue(event, secrets))
}
