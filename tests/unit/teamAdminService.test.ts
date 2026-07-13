import { describe, expect, it, vi } from 'vitest'
import { createTeamAdminService } from '@/lib/rbac/adminService'

describe('team administration service', () => {
  it('scopes role listings and invitations to the authorized workspace', async () => {
    const database = {
      role: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue({ id: 'role-viewer' }) },
      workspaceInvitation: { create: vi.fn().mockImplementation(({ data }) => ({ id: 'invite-1', ...data })) },
      executionEvent: { create: vi.fn() },
    }
    const service = createTeamAdminService(database as never)
    await service.listRoles('workspace-a')
    await service.invite({ workspaceId: 'workspace-a', email: 'new@example.com', roleId: 'role-viewer', invitedById: 'user-1' })
    expect(database.role.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'workspace-a' } }))
    expect(database.workspaceInvitation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'workspace-a', tokenHash: expect.not.stringContaining('smi_') }) }))
  })

  it('prevents removal of the final owner', async () => {
    const database = {
      membership: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', workspaceId: 'w', role: { key: 'owner' } }), count: vi.fn().mockResolvedValue(1) },
    }
    const service = createTeamAdminService(database as never)
    await expect(service.revokeMembership('w', 'm1')).rejects.toThrow('last workspace owner')
  })

  it('creates workspace-scoped custom roles with normalized permissions', async () => {
    const tx = { role: { create: vi.fn().mockResolvedValue({ id: 'custom-role' }) }, rolePermission: { createMany: vi.fn() } }
    const database = { $transaction: vi.fn((callback) => callback(tx)), executionEvent: { create: vi.fn() } }
    const service = createTeamAdminService(database as never)
    await service.createRole('workspace-a', 'user-1', { name: 'Release manager', permissions: ['git:update', 'git:update', 'approval:approve'] })
    expect(tx.role.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'workspace-a', key: 'release-manager', preset: false }) }))
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({ data: [{ roleId: 'custom-role', permission: 'approval:approve' }, { roleId: 'custom-role', permission: 'git:update' }] })
  })
})
