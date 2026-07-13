import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { encryptString } from '@/lib/storage/secretBox'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const triggers = await prisma.workflowTrigger.findMany({ where: { workflowId: (await params).id }, orderBy: { createdAt: 'desc' }, select: { id: true, type: true, enabled: true, configJson: true, webhookToken: true, createdAt: true, updatedAt: true } })
  return Response.json(triggers.map((item) => ({ ...item, config: JSON.parse(item.configJson), configJson: undefined })))
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workflowId = (await params).id; const body = await request.json()
  if (!['cron', 'webhook'].includes(body.type)) return Response.json({ error: 'Trigger type must be cron or webhook' }, { status: 400 })
  if (body.type === 'cron' && !body.cron) return Response.json({ error: 'Cron expression is required' }, { status: 400 })
  const secret = body.type === 'webhook' ? randomBytes(32).toString('base64url') : null
  const trigger = await prisma.workflowTrigger.create({ data: { workflowId, type: body.type, enabled: body.enabled !== false, configJson: JSON.stringify(body.type === 'cron' ? { cron: body.cron } : {}), webhookToken: body.type === 'webhook' ? randomBytes(24).toString('base64url') : null, webhookSecretEncrypted: secret ? encryptString(secret) : null } })
  return Response.json({ id: trigger.id, type: trigger.type, enabled: trigger.enabled, webhookToken: trigger.webhookToken, webhookSecret: secret }, { status: 201 })
}
