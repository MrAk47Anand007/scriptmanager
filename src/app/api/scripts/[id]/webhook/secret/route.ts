import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

// POST /api/scripts/[id]/webhook/secret — regenerate webhook HMAC secret
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const script = await prisma.script.findUnique({ where: { id } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  // Generate a 32-byte random hex secret
  const newSecret = crypto.randomBytes(32).toString('hex')

  await prisma.script.update({
    where: { id },
    data: { webhookSecret: newSecret }
  })

  // Return secret once — after this it won't be shown again in plaintext
  return NextResponse.json({ webhook_secret: newSecret })
}

// PUT /api/scripts/[id]/webhook/secret — toggle requireWebhookSignature
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { require_signature } = await req.json()

  const script = await prisma.script.findUnique({ where: { id } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  // If enabling signature and no secret exists yet, generate one automatically
  let newSecret = script.webhookSecret
  if (require_signature && !script.webhookSecret) {
    newSecret = crypto.randomBytes(32).toString('hex')
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
    ...(newSecret !== script.webhookSecret ? { webhook_secret: newSecret } : {})
  })
}
