import { prisma } from '@/lib/db'
import { createExecutionEventRepository } from './eventRepository'
import { createExecutionTelemetry } from './telemetry'

export * from './events'
export * from './telemetry'

export const executionTelemetry = createExecutionTelemetry(
  createExecutionEventRepository(prisma),
)
