import { describe, expect, it } from 'vitest'
import { ROLE_PRESETS, permissionKey } from '@/lib/rbac/catalog'

describe('RBAC catalog', () => {
  it('ships the six Phase 8 role presets with deny-by-default permissions', () => {
    expect(Object.keys(ROLE_PRESETS)).toEqual(['owner', 'admin', 'developer', 'operator', 'approver', 'viewer'])
    expect(ROLE_PRESETS.owner.permissions).toContain('*:*')
    expect(ROLE_PRESETS.viewer.permissions).toContain('script:read')
    expect(ROLE_PRESETS.viewer.permissions).not.toContain('secret:reveal')
    expect(permissionKey('workflow', 'run')).toBe('workflow:run')
    expect(permissionKey('api', 'run')).toBe('api:run')
  })
})
