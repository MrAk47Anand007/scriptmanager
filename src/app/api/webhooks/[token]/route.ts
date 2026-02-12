import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { executeScriptAsync } from '@/lib/scriptRunner'

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
  try {
    const body = await req.json()
    payload = JSON.stringify(body)
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
  executeScriptAsync(build.id, script).catch(err => {
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
