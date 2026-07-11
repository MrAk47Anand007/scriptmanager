import type { ExecutionEvent } from './events'
import { redactExecutionValue } from './events'

interface ExecutionEventDelegate {
  create(args: { data: Record<string, unknown> }): Promise<unknown>
}

interface ExecutionEventDatabase {
  executionEvent: ExecutionEventDelegate
}

export function createExecutionEventRepository(database: ExecutionEventDatabase) {
  return {
    async append(event: ExecutionEvent, secrets: string[] = []): Promise<void> {
      await database.executionEvent.create({
        data: {
          id: event.id,
          schemaVersion: event.schemaVersion,
          type: event.type,
          executionKind: event.executionKind,
          correlationId: event.correlationId,
          occurredAt: new Date(event.occurredAt),
          actorType: event.actor.type,
          actorId: event.actor.id,
          actorName: event.actor.name,
          targetType: event.target.type,
          targetId: event.target.id,
          targetName: event.target.name,
          dataJson: JSON.stringify(redactExecutionValue(event.data, secrets)),
        },
      })
    },
  }
}
