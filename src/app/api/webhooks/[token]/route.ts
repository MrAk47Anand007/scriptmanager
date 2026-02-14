import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { executeScriptAsync } from '@/lib/scriptRunner'
import type { ScriptParameter } from '@/lib/types'
import crypto from 'crypto'

/**
 * Verify an X-Hub-Signature-256 header against a shared secret.
 * Compatible with GitHub-style HMAC-SHA256 webhook signatures.
 */
function verifySignature(secret: string, body: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const script = await prisma.script.findUnique({
    where: { webhookToken: token }
  })

  if (!script) {
    return NextResponse.json({ error: 'Invalid webhook token' }, { status: 404 })
  }

  // Read raw body text so we can validate the HMAC before parsing JSON
  const rawBody = await req.text()

  // HMAC signature verification (optional per-script toggle)
  if (script.requireWebhookSignature && script.webhookSecret) {
    const signatureHeader = req.headers.get('x-hub-signature-256')
    const valid = verifySignature(script.webhookSecret, rawBody, signatureHeader)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let payload: string | null = rawBody || null
  let paramValues: Record<string, string> | undefined

  try {
    const body = JSON.parse(rawBody)

    // Extract param values from webhook body if script has parameters
    if (script.parameters && script.parameters !== '[]') {
      const scriptParams: ScriptParameter[] = JSON.parse(script.parameters)
      if (scriptParams.length > 0 && typeof body === 'object' && body !== null) {
        paramValues = {}
        for (const param of scriptParams) {
          if (Object.prototype.hasOwnProperty.call(body, param.name)) {
            paramValues[param.name] = String(body[param.name])
          } else if (param.defaultValue !== undefined) {
            paramValues[param.name] = param.defaultValue
          }
        }
      }
    }
  } catch {
    // No body or invalid JSON - that's fine
  }

  const build = await prisma.build.create({
    data: {
      scriptId: script.id,
      status: 'pending',
      triggeredBy: 'webhook',
      webhookPayload: payload
    }
  })

  // Fire-and-forget
  executeScriptAsync(build.id, script, paramValues).catch(err => {
    console.error('[Webhook] Script execution error:', err)
  })

  return NextResponse.json({
    message: 'Script triggered',
    build_id: build.id,
    script_name: script.name
  })
}

// Allow GET for testing (returns script info without triggering)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const script = await prisma.script.findUnique({
    where: { webhookToken: token },
    select: { id: true, name: true }
  })

  if (!script) {
    return NextResponse.json({ error: 'Invalid webhook token' }, { status: 404 })
  }

  return NextResponse.json({
    message: 'Webhook endpoint active. Send a POST request to trigger the script.',
    script_name: script.name
  })
}
