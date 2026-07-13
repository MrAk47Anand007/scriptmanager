import { describe, expect, it } from 'vitest'
import { createExecutionTelemetry } from '@/lib/execution/telemetry'

describe('execution telemetry', () => {
  it('never breaks the caller when persistence fails', async () => {
    const errors: unknown[] = []
    const telemetry = createExecutionTelemetry({
      append: async () => { throw new Error('database unavailable') },
    }, { error: (...values) => errors.push(...values) })

    await expect(telemetry.emit({
      type: 'execution.started', executionKind: 'script', correlationId: 'corr_1',
      actor: { type: 'user', id: 'admin' }, target: { type: 'script', id: 'script-1' }, data: {},
    })).resolves.toBeUndefined()
    expect(errors).toHaveLength(2)
  })

  it('uses an incoming correlation header or creates a new identifier', () => {
    const telemetry = createExecutionTelemetry({ append: async () => undefined })
    expect(telemetry.correlationId(new Request('http://localhost', {
      headers: { 'x-correlation-id': 'corr_external' },
    }))).toBe('corr_external')
    expect(telemetry.correlationId(new Request('http://localhost'))).toMatch(/^corr_/)
  })
})
