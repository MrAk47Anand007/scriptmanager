export const RBAC_RESOURCES = ['script', 'workflow', 'secret', 'agent', 'approval', 'ops', 'git', 'api', 'notification', 'plugin', 'member', 'role', 'session', 'audit'] as const
export type RbacResource = typeof RBAC_RESOURCES[number]
export type RbacAction = 'create' | 'read' | 'update' | 'delete' | 'run' | 'approve' | 'reveal' | 'manage'
export type PermissionKey = `${RbacResource | '*'}:${RbacAction | '*'}`

export const permissionKey = (resource: RbacResource, action: RbacAction): PermissionKey => `${resource}:${action}`

const readAll: PermissionKey[] = RBAC_RESOURCES.map((resource) => `${resource}:read` as PermissionKey)

export const ROLE_PRESETS: Record<string, { name: string; description: string; permissions: PermissionKey[] }> = {
  owner: { name: 'Owner', description: 'Full workspace authority and ownership controls.', permissions: ['*:*'] },
  admin: { name: 'Admin', description: 'Workspace administration except ownership transfer.', permissions: [...readAll, 'script:*', 'workflow:*', 'secret:*', 'agent:*', 'approval:*', 'ops:*', 'git:*', 'api:*', 'notification:*', 'member:*', 'role:*', 'session:*', 'audit:*'] },
  developer: { name: 'Developer', description: 'Build and run scripts, workflows, agents, Git changes, and plugins.', permissions: ['script:*', 'workflow:*', 'agent:*', 'git:*', 'api:*', 'notification:*', 'plugin:read', 'plugin:run', 'secret:read', 'ops:read', 'approval:read', 'audit:read'] },
  operator: { name: 'Operator', description: 'Run and monitor automations and operational tasks.', permissions: ['script:read', 'script:run', 'workflow:read', 'workflow:run', 'agent:read', 'agent:run', 'api:read', 'api:run', 'notification:read', 'plugin:read', 'plugin:run', 'ops:*', 'git:read', 'approval:read', 'audit:read'] },
  approver: { name: 'Approver', description: 'Review protected actions and inspect supporting context.', permissions: ['approval:*', 'script:read', 'workflow:read', 'agent:read', 'api:read', 'notification:read', 'ops:read', 'git:read', 'audit:read'] },
  viewer: { name: 'Viewer', description: 'Read-only access to non-secret workspace information.', permissions: ['script:read', 'workflow:read', 'agent:read', 'api:read', 'notification:read', 'plugin:read', 'approval:read', 'ops:read', 'git:read', 'audit:read'] },
}
