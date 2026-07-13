import { NextResponse } from 'next/server'
import type { RbacAction, RbacResource } from './catalog'
import { authorize } from './authorization'
import { resolveRequestContext } from './requestContext'

export async function authorizeRequest(request: Request, resource: RbacResource, action: RbacAction, resourceWorkspaceId?: string) {
  const context = await resolveRequestContext(request)
  const decision = authorize(context, resource, action, resourceWorkspaceId)
  if (!decision.allowed) {
    return { context: null, response: NextResponse.json({ error: decision.reason, permission: decision.permission }, { status: decision.reason === 'unauthenticated' ? 401 : 403 }) }
  }
  return { context: context!, response: null }
}
