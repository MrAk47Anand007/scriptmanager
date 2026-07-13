import { describe, expect, it } from 'vitest'
import { authorize } from '@/lib/rbac/authorization'
import type { AuthorizationContext } from '@/lib/rbac/types'

const context = (permissions: string[], workspaceId = 'workspace-a'): AuthorizationContext => ({
  userId: 'user-1', workspaceId, membershipId: 'member-1', roleKey: 'custom', permissions,
})

describe('resource/action authorization', () => {
  it('denies absent permissions and cross-workspace resources by default', () => {
    expect(authorize(context([]), 'script', 'read')).toMatchObject({ allowed: false, reason: 'permission_denied' })
    expect(authorize(context(['*:*']), 'script', 'read', 'workspace-b')).toMatchObject({ allowed: false, reason: 'workspace_mismatch' })
  })

  it('supports exact, resource wildcard, and owner wildcard grants', () => {
    expect(authorize(context(['script:read']), 'script', 'read').allowed).toBe(true)
    expect(authorize(context(['workflow:*']), 'workflow', 'run').allowed).toBe(true)
    expect(authorize(context(['*:*']), 'secret', 'reveal').allowed).toBe(true)
  })

  it('covers the Phase 8 preset matrix without leaking viewer secret access', () => {
    expect(authorize(context(['approval:*']), 'approval', 'approve').allowed).toBe(true)
    expect(authorize(context(['secret:read']), 'secret', 'reveal').allowed).toBe(false)
    expect(authorize(context(['git:read']), 'git', 'update').allowed).toBe(false)
  })
})
