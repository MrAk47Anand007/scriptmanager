import { prisma } from '@/lib/db'
import { createWorkflowRepository } from './repository'

export const workflowRepository = createWorkflowRepository(prisma)

export function workflowJson(workflow: { draftDefinition: string; [key: string]: unknown }) {
  return { ...workflow, definition: JSON.parse(workflow.draftDefinition), draftDefinition: undefined }
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Workflow operation failed'
  const status = message.includes('not found') || message.includes('No record') ? 404 : message.includes('Cannot') ? 409 : 400
  return Response.json({ error: message }, { status })
}
