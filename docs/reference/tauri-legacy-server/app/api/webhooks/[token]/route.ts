import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ensureBuildEmitter, executeScriptAsync } from '@/lib/scriptRunner'
import type { ScriptParameter } from '@/lib/types'
import crypto from 'crypto'
import { executionTelemetry } from '@/lib/execution'
import { resolveResourceSecret } from '@/lib/secrets/migration'
import { checkRateLimit, readBoundedBody, verifyReplayWindow, type RateLimitEntry } from '@/lib/production/httpSecurity'

const webhookLimits = new Map<string, RateLimitEntry>()
const MAX_WEBHOOK_BYTES = 1_048_576

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
  const correlationId = executionTelemetry.correlationId(req)
  const rate = checkRateLimit(webhookLimits, token, Date.now(), { limit: 60, windowMs: 60_000 })
  if (!rate.allowed) return NextResponse.json({ error: 'Webhook rate limit exceeded' }, { status: 429, headers: { 'retry-after': String(Math.ceil(rate.retryAfterMs / 1_000)) } })

  const script = await prisma.script.findUnique({
    where: { webhookToken: token }
  })

  if (!script) {
    return NextResponse.json({ error: 'Invalid webhook token' }, { status: 404 })
  }

  // Read raw body text so we can validate the HMAC before parsing JSON
  let rawBody: string
  try { rawBody = new TextDecoder().decode(await readBoundedBody(req, MAX_WEBHOOK_BYTES)) }
  catch { return NextResponse.json({ error: 'Webhook body too large' }, { status: 413 }) }

  // HMAC signature verification (optional per-script toggle)
  if (script.requireWebhookSignature && script.webhookSecret) {
    try { verifyReplayWindow(req.headers.get('x-scriptmanager-timestamp')) }
    catch { return NextResponse.json({ error: 'Invalid or stale webhook timestamp' }, { status: 401 }) }
    const signatureHeader = req.headers.get('x-hub-signature-256')
    const signingSecret = script.webhookSecret.startsWith('secretref:')
      ? await resolveResourceSecret(prisma, script.webhookSecret, { resourceType: 'script', resourceId: script.id, field: 'webhook-signing', workspaceId: script.workspaceId }, 'script-webhook-runtime') ?? ''
      : script.webhookSecret
    const valid = verifySignature(signingSecret, rawBody, signatureHeader)
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

  ensureBuildEmitter(build.id)

  // Fire-and-forget
  executeScriptAsync(build.id, script, paramValues, {
    correlationId, actor: { type: 'webhook', id: script.id }, trigger: 'webhook',
  }).catch(err => {
    console.error('[Webhook] Script execution error:', err)
  })

  return NextResponse.json({
    message: 'Script triggered',
    build_id: build.id,
    script_name: script.name
  }, { headers: { 'x-correlation-id': correlationId } })
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
