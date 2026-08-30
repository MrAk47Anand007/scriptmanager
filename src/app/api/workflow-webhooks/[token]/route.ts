import { prisma } from '@/lib/db'
import { decryptString } from '@/lib/storage/secretBox'
import { resolveResourceSecret } from '@/lib/secrets/migration'
import { createWorkflowRepository } from '@/lib/workflows/repository'
import { createWorkflowTriggerService, verifyWorkflowWebhookSignature } from '@/lib/workflows/triggers'
import { notifyWorkflowWorker } from '@/lib/workflows/workerLoop'
import { checkRateLimit, readBoundedBody, type RateLimitEntry } from '@/lib/production/httpSecurity'

const webhookLimits = new Map<string, RateLimitEntry>()
const MAX_WEBHOOK_BYTES = 1_048_576

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token
  const rate = checkRateLimit(webhookLimits, token, Date.now(), { limit: 60, windowMs: 60_000 })
  if (!rate.allowed) return Response.json({ error: 'Webhook rate limit exceeded' }, { status: 429, headers: { 'retry-after': String(Math.ceil(rate.retryAfterMs / 1_000)) } })
  const trigger = await prisma.workflowTrigger.findUnique({ where: { webhookToken: token }, include: { workflow: { include: { versions: true } } } })
  if (!trigger?.enabled || trigger.type !== 'webhook' || !trigger.webhookSecretEncrypted) return Response.json({ error: 'Webhook not found' }, { status: 404 })
  let rawBody: string
  try { rawBody = new TextDecoder().decode(await readBoundedBody(request, MAX_WEBHOOK_BYTES)) }
  catch { return Response.json({ error: 'Webhook body too large' }, { status: 413 }) }
  const signingSecret = trigger.webhookSecretEncrypted.startsWith('secretref:')
    ? await resolveResourceSecret(prisma, trigger.webhookSecretEncrypted, { resourceType: 'workflow-trigger', resourceId: trigger.id, field: 'webhook-signing', workspaceId: trigger.workflow.workspaceId }, 'workflow-webhook-runtime') ?? ''
    : decryptString(trigger.webhookSecretEncrypted)
  if (!verifyWorkflowWebhookSignature(rawBody, request.headers.get('x-scriptmanager-signature'), signingSecret)) return Response.json({ error: 'Invalid signature' }, { status: 401 })
  const version = trigger.workflow.versions.find((item) => item.version === trigger.workflow.publishedVersion)
  if (!version) return Response.json({ error: 'Workflow is not published' }, { status: 409 })
  let payload: unknown = {}
  try { payload = rawBody ? JSON.parse(rawBody) : {} } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const run = await createWorkflowTriggerService(createWorkflowRepository(prisma)).webhook({ workflowId: trigger.workflowId, versionId: version.id, triggerId: trigger.id, deliveryId: request.headers.get('x-delivery-id') ?? undefined, rawBody, payload, workspaceId: trigger.workflow.workspaceId })
  notifyWorkflowWorker()
  return Response.json(run, { status: 202 })
}
