import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createExecutionEventRepository } from '@/lib/execution/eventRepository'
import { createExecutionEvent } from '@/lib/execution/events'

afterAll(async () => {
  await prisma.executionEvent.deleteMany({ where: { correlationId: 'corr_integration' } })
  await prisma.$disconnect()
})

describe('execution event persistence', () => {
  it('writes and reads a redacted event through Prisma', async () => {
    const repository = createExecutionEventRepository(prisma)
    const event = createExecutionEvent({
      type: 'execution.started', executionKind: 'script', correlationId: 'corr_integration',
      actor: { type: 'system', id: 'integration-test' },
      target: { type: 'script', id: 'script-test' }, data: { password: 'never-store-this' },
    })

    await repository.append(event)
    const stored = await prisma.executionEvent.findUniqueOrThrow({ where: { id: event.id } })
    expect(stored.dataJson).toBe('{"password":"[REDACTED]"}')
  })
})
