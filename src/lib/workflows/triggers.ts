import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export function verifyWorkflowWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'), 'hex')
  const receivedHex = signatureHeader.slice(7)
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false
  const received = Buffer.from(receivedHex, 'hex')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export function deriveWebhookIdempotencyKey(triggerId: string, deliveryId: string | undefined, rawBody: string): string {
  const requestIdentity = deliveryId ?? createHash('sha256').update(rawBody).digest('hex')
  return `webhook:${triggerId}:${requestIdentity}`
}

type EnqueueInput = {
  workflowId: string
  versionId: string
  triggerType: string
  actorId: string
  idempotencyKey?: string
  payload?: unknown
}

type TriggerRepository = { enqueueRun(input: EnqueueInput): Promise<unknown> }

export function createWorkflowTriggerService(repository: TriggerRepository) {
  return {
    manual(input: { workflowId: string; versionId: string; actorId: string; payload?: unknown }) {
      return repository.enqueueRun({ ...input, triggerType: 'manual' })
    },
    cron(input: { workflowId: string; versionId: string; triggerId: string; scheduledAt: Date; payload?: unknown }) {
      return repository.enqueueRun({
        workflowId: input.workflowId,
        versionId: input.versionId,
        triggerType: 'cron',
        actorId: input.triggerId,
        idempotencyKey: `cron:${input.triggerId}:${input.scheduledAt.toISOString()}`,
        payload: input.payload,
      })
    },
    webhook(input: { workflowId: string; versionId: string; triggerId: string; deliveryId?: string; rawBody: string; payload?: unknown }) {
      return repository.enqueueRun({
        workflowId: input.workflowId,
        versionId: input.versionId,
        triggerType: 'webhook',
        actorId: input.triggerId,
        idempotencyKey: deriveWebhookIdempotencyKey(input.triggerId, input.deliveryId, input.rawBody),
        payload: input.payload,
      })
    },
  }
}
