import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { executeScriptAsync } from '@/lib/scriptRunner'
import type { ScriptParameter } from '@/lib/types'

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

  let payload: string | null = null
  let paramValues: Record<string, string> | undefined

  try {
    const body = await req.json()
    payload = JSON.stringify(body)

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
