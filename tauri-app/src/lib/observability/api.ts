import { prisma } from '@/lib/db'
import { createWorkflowRepository } from '@/lib/workflows/repository'
import { createObservabilityRepository } from './repository'

export const observabilityRepository = createObservabilityRepository(prisma)
export const observabilityWorkflowRepository = createWorkflowRepository(prisma)

export function observabilityError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Observability request failed'
  const status = message.startsWith('Invalid ') ? 400 : message.includes('not found') ? 404 : message.startsWith('Cannot ') ? 409 : 500
  return Response.json({ error: message }, { status })
}

