import type { RbacAction, RbacResource } from './catalog'
import type { AuthorizationContext, AuthorizationDecision } from './types'

export class AuthorizationError extends Error {
  constructor(public readonly decision: AuthorizationDecision) {
    super(`Forbidden: ${decision.reason} (${decision.permission})`)
    this.name = 'AuthorizationError'
  }
}

export function permissionAllows(permissions: readonly string[], resource: RbacResource, action: RbacAction): boolean {
  return permissions.includes('*:*') || permissions.includes(`${resource}:*`) || permissions.includes(`${resource}:${action}`)
}

export function authorize(context: AuthorizationContext | null | undefined, resource: RbacResource, action: RbacAction, resourceWorkspaceId?: string): AuthorizationDecision {
  const permission = `${resource}:${action}` as const
  if (!context) return { allowed: false, reason: 'unauthenticated', permission }
  if (resourceWorkspaceId && context.workspaceId !== resourceWorkspaceId) return { allowed: false, reason: 'workspace_mismatch', permission }
  if (!permissionAllows(context.permissions, resource, action)) return { allowed: false, reason: 'permission_denied', permission }
  return { allowed: true, reason: 'allowed', permission }
}

export function requireAuthorization(context: AuthorizationContext | null | undefined, resource: RbacResource, action: RbacAction, resourceWorkspaceId?: string): AuthorizationContext {
  const decision = authorize(context, resource, action, resourceWorkspaceId)
  if (!decision.allowed) throw new AuthorizationError(decision)
  return context!
}
