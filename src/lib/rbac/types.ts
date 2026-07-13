import type { RbacAction, RbacResource } from './catalog'

export type AuthorizationContext = {
  userId: string
  workspaceId: string
  membershipId: string
  roleKey: string
  permissions: string[]
  sessionId?: string
}

export type AuthorizationDecision = {
  allowed: boolean
  reason: 'allowed' | 'unauthenticated' | 'workspace_mismatch' | 'permission_denied'
  permission: `${RbacResource}:${RbacAction}`
}
