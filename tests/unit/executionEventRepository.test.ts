import { describe, expect, it } from 'vitest'
import { createExecutionEvent } from '@/lib/execution/events'
import { createExecutionEventRepository } from '@/lib/execution/eventRepository'

describe('execution event repository', () => {
  it('persists a redacted event record', async () => {
    let record: Record<string, unknown> | undefined
    const repository = createExecutionEventRepository({
      executionEvent: { create: async ({ data }) => { record = data; return data } },
    })
    const event = createExecutionEvent({
      type: 'execution.started', executionKind: 'script', correlationId: 'corr_1',
      actor: { type: 'user', id: 'admin' }, target: { type: 'script', id: 'script-1' },
      data: { password: 'value', message: 'credential-value' },
    })

    await repository.append(event, ['credential-value'])

    expect(record).toMatchObject({
      id: event.id, type: 'execution.started', executionKind: 'script', correlationId: 'corr_1',
      actorType: 'user', actorId: 'admin', targetType: 'script', targetId: 'script-1',
    })
    expect(record?.dataJson).toBe('{"password":"[REDACTED]","message":"[REDACTED]"}')
  })
})
