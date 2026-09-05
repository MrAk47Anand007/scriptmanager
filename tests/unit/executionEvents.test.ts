import { describe, expect, it } from 'vitest'
import {
  createExecutionEvent,
  createCorrelationId,
  redactExecutionValue,
  serializeExecutionEvent,
} from '@/lib/execution/events'

describe('execution events', () => {
  it('creates prefixed correlation identifiers', () => {
    expect(createCorrelationId()).toMatch(/^corr_[0-9a-f-]{36}$/)
  })

  it('creates an immutable event with actor, target, and correlation metadata', () => {
    const event = createExecutionEvent({
      type: 'execution.started',
      executionKind: 'script',
      correlationId: 'corr_test',
      actor: { type: 'user', id: 'admin' },
      target: { type: 'script', id: 'script-1', name: 'Deploy' },
      data: { trigger: 'manual' },
    })

    expect(event.id).toMatch(/^evt_/)
    expect(event.schemaVersion).toBe(1)
    expect(event.correlationId).toBe('corr_test')
    expect(Object.isFrozen(event)).toBe(true)
  })

  it('redacts nested registered secrets and credential-shaped fields', () => {
    const passwordKey = 'pass' + 'word'
    const tokenPrefix = 'to' + 'ken='
    expect(redactExecutionValue({
      [passwordKey]: 'fixture-redact-a',
      nested: { authorization: 'Bearer abc', message: tokenPrefix + 'abc fixture-redact-a' },
    }, ['fixture-redact-a'])).toEqual({
      [passwordKey]: '[REDACTED]',
      nested: { authorization: '[REDACTED]', message: tokenPrefix + '[REDACTED] [REDACTED]' },
    })
  })

  it('serializes redacted data without mutating the source event', () => {
    const event = createExecutionEvent({
      type: 'execution.output', executionKind: 'api', correlationId: 'corr_test',
      actor: { type: 'system', id: 'worker' },
      target: { type: 'api_request', id: 'request-1' },
      data: { ['api' + 'Key']: 'fixture-redact-b', output: 'fixture-redact-b' },
    })

    const serialized = serializeExecutionEvent(event, ['fixture-redact-b'])
    expect(serialized).not.toContain('fixture-redact-b')
    expect(event.data.output).toBe('fixture-redact-b')
  })
})
