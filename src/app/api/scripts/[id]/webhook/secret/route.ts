import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'
import { storeResourceSecret } from '@/lib/secrets/migration'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

// POST /api/scripts/[id]/webhook/secret — regenerate webhook HMAC secret
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'update')
  if (authorization.response) return authorization.response
  const { id } = await params

  const script = await prisma.script.findFirst({ where: { id, workspaceId: authorization.context.workspaceId } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  // Generate a 32-byte random hex secret
  const newSecret = crypto.randomBytes(32).toString('hex')
  const secretReference = await storeResourceSecret(prisma, { resourceType: 'script', resourceId: id, field: 'webhook-signing', name: `script:${id}:webhook-signing`, workspaceId: authorization.context.workspaceId }, newSecret, authorization.context.userId)

  await prisma.script.update({
    where: { id },
    data: { webhookSecret: secretReference }
  })

  // Return secret once — after this it won't be shown again in plaintext
  return NextResponse.json({ webhook_secret: newSecret })
}

// PUT /api/scripts/[id]/webhook/secret — toggle requireWebhookSignature
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'update')
  if (authorization.response) return authorization.response
  const { id } = await params
  const { require_signature } = await req.json()

  const script = await prisma.script.findFirst({ where: { id, workspaceId: authorization.context.workspaceId } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  // If enabling signature and no secret exists yet, generate one automatically
  let newSecret = script.webhookSecret
  let revealedSecret: string | null = null
  if (require_signature && !script.webhookSecret) {
    revealedSecret = crypto.randomBytes(32).toString('hex')
    newSecret = await storeResourceSecret(prisma, { resourceType: 'script', resourceId: id, field: 'webhook-signing', name: `script:${id}:webhook-signing`, workspaceId: authorization.context.workspaceId }, revealedSecret, authorization.context.userId)
  } else if (require_signature && script.webhookSecret && !script.webhookSecret.startsWith('secretref:')) {
    newSecret = await storeResourceSecret(prisma, { resourceType: 'script', resourceId: id, field: 'webhook-signing', name: `script:${id}:webhook-signing`, workspaceId: authorization.context.workspaceId }, script.webhookSecret, authorization.context.userId)
  }

  const updated = await prisma.script.update({
    where: { id },
    data: {
      requireWebhookSignature: require_signature,
      ...(newSecret !== script.webhookSecret ? { webhookSecret: newSecret } : {})
    }
  })

  return NextResponse.json({
    require_webhook_signature: updated.requireWebhookSignature,
    // Return new secret if it was just auto-generated
    ...(revealedSecret ? { webhook_secret: revealedSecret } : {})
  })
}
