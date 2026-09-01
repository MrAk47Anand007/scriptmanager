import { NextResponse } from 'next/server'
import { defaultSecretVaultService } from '@/lib/secrets/defaultService'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, 'secret', 'read')
  if (authorization.response) return authorization.response
  try {
    return NextResponse.json(await defaultSecretVaultService().accessHistory((await params).id, authorization.context.workspaceId))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('match') ? 403 : message.includes('not found') ? 404 : 409
    return NextResponse.json({ error: message }, { status })
  }
}
