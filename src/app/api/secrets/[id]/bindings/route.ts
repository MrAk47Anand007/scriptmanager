import { NextResponse } from 'next/server'
import { defaultSecretVaultService } from '@/lib/secrets/defaultService'
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext'
import { requireTrustedContext } from '@/lib/runtime/trustedContext'
import { prisma } from '@/lib/db'

function errorStatus(message: string) {
  if (message.includes('Unauthorized')) return 401
  if (message.includes('required')) return 400
  if (message.includes('match') || message.includes('denied')) return 403
  if (message.includes('not found')) return 404
  return 409
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = requireTrustedContext(await resolveTrustedRequestContext(request, prisma))
    const { id } = await params
    const body = await request.json()
    return NextResponse.json(await defaultSecretVaultService().bindSecret(id, { resourceType: body.resourceType, resourceId: body.resourceId, field: body.field, workspaceId: actor.workspaceId, createdBy: actor.actorId }), { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: errorStatus(message) })
  }
}
