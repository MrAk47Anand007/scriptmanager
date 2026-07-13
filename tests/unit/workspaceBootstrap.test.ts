import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_ADMIN_EMAIL, DEFAULT_USER_ID, DEFAULT_WORKSPACE_ID, ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'

describe('default workspace bootstrap', () => {
  it('upserts an administrator, workspace, preset roles, and owner membership', async () => {
    const tx = {
      user: { upsert: vi.fn().mockResolvedValue({ id: DEFAULT_USER_ID }) },
      workspace: { upsert: vi.fn().mockResolvedValue({ id: DEFAULT_WORKSPACE_ID }) },
      role: { upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve(create)) },
      rolePermission: { deleteMany: vi.fn(), createMany: vi.fn() },
      membership: { upsert: vi.fn() },
    }
    const database = { $transaction: vi.fn((callback) => callback(tx)) }

    await expect(ensureDefaultWorkspace(database as never)).resolves.toEqual({
      userId: DEFAULT_USER_ID,
      workspaceId: DEFAULT_WORKSPACE_ID,
    })
    expect(tx.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: DEFAULT_ADMIN_EMAIL },
    }))
    expect(tx.role.upsert).toHaveBeenCalledTimes(6)
    expect(tx.membership.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_workspaceId: { userId: DEFAULT_USER_ID, workspaceId: DEFAULT_WORKSPACE_ID } },
    }))
  })
})
