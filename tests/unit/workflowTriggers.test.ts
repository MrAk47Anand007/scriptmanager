import { describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { createWorkflowTriggerService, deriveWebhookIdempotencyKey, verifyWorkflowWebhookSignature } from '@/lib/workflows/triggers'

describe('workflow triggers', () => {
  it('verifies sha256 signatures using timing-safe comparison', () => {
    const body = '{"release":1}'
    const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`
    expect(verifyWorkflowWebhookSignature(body, signature, 'secret')).toBe(true)
    expect(verifyWorkflowWebhookSignature(body, 'sha256=bad', 'secret')).toBe(false)
  })

  it('derives stable scoped idempotency keys', () => {
    expect(deriveWebhookIdempotencyKey('trigger-1', 'delivery-1', '{}')).toBe(deriveWebhookIdempotencyKey('trigger-1', 'delivery-1', '{}'))
    expect(deriveWebhookIdempotencyKey('trigger-1', undefined, 'a')).not.toBe(deriveWebhookIdempotencyKey('trigger-1', undefined, 'b'))
  })

  it('enqueues manual and cron runs with explicit actors', async () => {
    const enqueueRun = vi.fn(async (input) => input)
    const service = createWorkflowTriggerService({ enqueueRun })
    await service.manual({ workflowId: 'w', versionId: 'v', actorId: 'admin', payload: { value: 1 } })
    await service.cron({ workflowId: 'w', versionId: 'v', triggerId: 't', scheduledAt: new Date('2026-07-13T00:00:00Z') })
    expect(enqueueRun).toHaveBeenNthCalledWith(1, expect.objectContaining({ triggerType: 'manual', actorId: 'admin' }))
    expect(enqueueRun).toHaveBeenNthCalledWith(2, expect.objectContaining({ triggerType: 'cron', actorId: 't', idempotencyKey: expect.stringContaining('cron:t:') }))
  })
})
