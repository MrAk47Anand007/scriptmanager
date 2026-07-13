import type { RbacAction, RbacResource } from './catalog'
import { permissionAllows } from './authorization'

type AgentAuthorityInput = {
  userPermissions: string[]
  profilePermissions: string[]
  workspacePermissions: string[]
  resource: RbacResource
  action: RbacAction
  protectedAction?: boolean
}

export function authorizeAgentAuthority(input: AgentAuthorityInput): { allowed: boolean; requiresApproval: boolean; reason: string } {
  if (!permissionAllows(input.userPermissions, input.resource, input.action)) return { allowed: false, requiresApproval: false, reason: 'initiating_user_denied' }
  if (!permissionAllows(input.profilePermissions, input.resource, input.action)) return { allowed: false, requiresApproval: false, reason: 'agent_profile_denied' }
  if (!permissionAllows(input.workspacePermissions, input.resource, input.action)) return { allowed: false, requiresApproval: false, reason: 'workspace_policy_denied' }
  if (input.protectedAction) return { allowed: false, requiresApproval: true, reason: 'approval_required' }
  return { allowed: true, requiresApproval: false, reason: 'allowed' }
}
