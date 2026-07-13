import { prisma } from '@/lib/db'
import { decryptString } from '@/lib/storage/secretBox'
import { resolveResourceSecret } from '@/lib/secrets/migration'
import { createWorkflowRepository } from '@/lib/workflows/repository'
import { createWorkflowTriggerService, verifyWorkflowWebhookSignature } from '@/lib/workflows/triggers'

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const trigger = await prisma.workflowTrigger.findUnique({ where: { webhookToken: (await params).token }, include: { workflow: { include: { versions: true } } } })
  if (!trigger?.enabled || trigger.type !== 'webhook' || !trigger.webhookSecretEncrypted) return Response.json({ error: 'Webhook not found' }, { status: 404 })
  const rawBody = await request.text()
  const signingSecret = trigger.webhookSecretEncrypted.startsWith('secretref:')
    ? await resolveResourceSecret(prisma, trigger.webhookSecretEncrypted, { resourceType: 'workflow-trigger', resourceId: trigger.id, field: 'webhook-signing' }, 'workflow-webhook-runtime') ?? ''
    : decryptString(trigger.webhookSecretEncrypted)
  if (!verifyWorkflowWebhookSignature(rawBody, request.headers.get('x-scriptmanager-signature'), signingSecret)) return Response.json({ error: 'Invalid signature' }, { status: 401 })
  const version = trigger.workflow.versions.find((item) => item.version === trigger.workflow.publishedVersion)
  if (!version) return Response.json({ error: 'Workflow is not published' }, { status: 409 })
  let payload: unknown = {}
  try { payload = rawBody ? JSON.parse(rawBody) : {} } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const run = await createWorkflowTriggerService(createWorkflowRepository(prisma)).webhook({ workflowId: trigger.workflowId, versionId: version.id, triggerId: trigger.id, deliveryId: request.headers.get('x-delivery-id') ?? undefined, rawBody, payload })
  return Response.json(run, { status: 202 })
}
