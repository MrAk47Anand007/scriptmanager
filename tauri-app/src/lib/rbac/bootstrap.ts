import type { PrismaClient } from '@prisma/client'
import { ROLE_PRESETS } from './catalog'

export const DEFAULT_USER_ID = 'local-admin'
export const DEFAULT_ADMIN_EMAIL = 'admin@scriptmanager.local'
export const DEFAULT_WORKSPACE_ID = 'default'

export async function ensureDefaultWorkspace(database: PrismaClient): Promise<{ userId: string; workspaceId: string }> {
  return database.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: DEFAULT_ADMIN_EMAIL },
      create: { id: DEFAULT_USER_ID, email: DEFAULT_ADMIN_EMAIL, name: 'Local Administrator', status: 'active' },
      update: {},
    })
    const workspace = await tx.workspace.upsert({
      where: { id: DEFAULT_WORKSPACE_ID },
      create: { id: DEFAULT_WORKSPACE_ID, name: 'Default Workspace', slug: 'default', createdBy: user.id },
      update: {},
    })

    const roles = new Map<string, string>()
    for (const [key, preset] of Object.entries(ROLE_PRESETS)) {
      const role = await tx.role.upsert({
        where: { workspaceId_key: { workspaceId: workspace.id, key } },
        create: { workspaceId: workspace.id, key, name: preset.name, description: preset.description, preset: true },
        update: { name: preset.name, description: preset.description, preset: true },
      })
      roles.set(key, role.id)
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } })
      await tx.rolePermission.createMany({ data: preset.permissions.map((permission) => ({ roleId: role.id, permission })) })
    }
    await tx.membership.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
      create: { userId: user.id, workspaceId: workspace.id, roleId: roles.get('owner')!, status: 'active' },
      update: { roleId: roles.get('owner')!, status: 'active' },
    })
    return { userId: user.id, workspaceId: workspace.id }
  })
}
