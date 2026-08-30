import { prisma } from '@/lib/db'
import { createWorkflowRepository } from './repository'
import { resolveRequestContext } from '@/lib/rbac/requestContext'

export const workflowRepository = createWorkflowRepository(prisma)

export function workflowJson(workflow: { draftDefinition: string; [key: string]: unknown }) {
  return { ...workflow, definition: JSON.parse(workflow.draftDefinition), draftDefinition: undefined }
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Workflow operation failed'
  const status = message.includes('not found') || message.includes('No record') ? 404 : message.includes('Cannot') ? 409 : 400
  return Response.json({ error: message }, { status })
}

export async function resolveWorkflowActor(request: Request): Promise<{ userId: string; workspaceId: string }> {
  const context = await resolveRequestContext(request)
  if (!context) throw new Error('Unauthorized')
  return { userId: context.userId, workspaceId: context.workspaceId }
}
