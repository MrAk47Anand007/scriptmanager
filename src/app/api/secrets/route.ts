import { NextResponse } from 'next/server'
import { defaultSecretVaultService } from '@/lib/secrets/defaultService'
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext'
import { requireTrustedContext } from '@/lib/runtime/trustedContext'
import { prisma } from '@/lib/db'

function errorStatus(message: string) {
  if (message.includes('required')) return 400
  if (message.includes('Unauthorized')) return 401
  if (message.includes('match') || message.includes('denied')) return 403
  if (message.includes('not found')) return 404
  return 409
}

export async function GET(request: Request) {
  try {
    const actor = requireTrustedContext(await resolveTrustedRequestContext(request, prisma))
    return NextResponse.json(await defaultSecretVaultService().listSecrets(actor.workspaceId))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: errorStatus(message) })
  }
}

export async function POST(request: Request) {
  try {
    const actor = requireTrustedContext(await resolveTrustedRequestContext(request, prisma))
    const body = await request.json()
    if (!body.name || !body.plaintext) return NextResponse.json({ error: 'name and plaintext are required' }, { status: 400 })
    const secret = await defaultSecretVaultService().createSecret({ name: body.name, plaintext: body.plaintext, description: body.description, scope: body.scope, workspaceId: actor.workspaceId, createdBy: actor.actorId })
    return NextResponse.json(secret, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: errorStatus(message) })
  }
}
