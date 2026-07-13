import { describe, expect, it } from 'vitest'
import { authorizeAgentAuthority } from '@/lib/rbac/agentAuthority'

describe('agent authority intersection', () => {
  const base = {
    userPermissions: ['git:*'], profilePermissions: ['git:read', 'git:update'],
    workspacePermissions: ['git:read', 'git:update'], resource: 'git' as const, action: 'update' as const,
  }

  it('requires user, profile, and workspace policy to all allow an action', () => {
    expect(authorizeAgentAuthority(base).allowed).toBe(true)
    expect(authorizeAgentAuthority({ ...base, userPermissions: ['git:read'] }).reason).toBe('initiating_user_denied')
    expect(authorizeAgentAuthority({ ...base, profilePermissions: ['git:read'] }).reason).toBe('agent_profile_denied')
    expect(authorizeAgentAuthority({ ...base, workspacePermissions: ['git:read'] }).reason).toBe('workspace_policy_denied')
  })

  it('requires approval even when all layers allow a protected action', () => {
    expect(authorizeAgentAuthority({ ...base, protectedAction: true })).toMatchObject({ allowed: false, requiresApproval: true })
  })
})
