import { NextResponse } from 'next/server'
import { defaultSecretVaultService } from '@/lib/secrets/defaultService'
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext'
import { requireTrustedContext } from '@/lib/runtime/trustedContext'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

function errorStatus(message: string) {
  if (message.includes('Unauthorized')) return 401
  if (message.includes('match') || message.includes('denied')) return 403
  if (message.includes('not found')) return 404
  return 409
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authorization = await authorizeRequest(request, 'secret', 'update')
    if (authorization.response) return authorization.response
    const actor = requireTrustedContext(await resolveTrustedRequestContext(request, prisma))
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    return NextResponse.json(await defaultSecretVaultService().disableSecret(id, { actorType: 'user', actorId: actor.actorId, workspaceId: actor.workspaceId, capability: 'secret:write', resource: body.resource ?? '*', reason: body.reason ?? 'manual disable' }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: errorStatus(message) })
  }
}
