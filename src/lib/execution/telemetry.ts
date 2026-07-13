import type { CreateExecutionEventInput, ExecutionEvent } from './events'
import { createCorrelationId, createExecutionEvent } from './events'

interface EventSink {
  append(event: ExecutionEvent, secrets?: string[]): Promise<void>
}

interface TelemetryLogger {
  error(...values: unknown[]): void
}

export function createExecutionTelemetry(
  sink: EventSink,
  logger: TelemetryLogger = console,
) {
  return {
    correlationId(request: Request): string {
      return request.headers.get('x-correlation-id')?.trim() || createCorrelationId()
    },

    async emit(input: CreateExecutionEventInput, secrets: string[] = []): Promise<void> {
      try {
        await sink.append(createExecutionEvent(input), secrets)
      } catch (error) {
        logger.error('[execution-telemetry] failed to persist event', error)
      }
    },
  }
}
