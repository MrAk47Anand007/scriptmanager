import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'

export type RuntimeMode = 'desktop' | 'web'

export type AuthType = 'desktop' | 'session' | 'bearer'

export interface TrustedActorContext {
  runtimeMode: RuntimeMode
  authType: AuthType
  actorId: string
  actorName?: string
  workspaceId: string
  membershipId: string
  roleKey: string
  permissions: string[]
  sessionId?: string
}

export function requireTrustedContext<T>(value: T | null | undefined, message = 'Unauthorized'): T {
  if (!value) {
    throw new Error(message)
  }
  return value
}

export async function createDesktopActorContext(database: PrismaClient = prisma): Promise<TrustedActorContext> {
  const identity = await ensureDefaultWorkspace(database)
  const membership = await database.membership.findUnique({
    where: {
      userId_workspaceId: {
        userId: identity.userId,
        workspaceId: identity.workspaceId,
      },
    },
    include: { role: { include: { permissions: true } } },
  })

  if (!membership || membership.status !== 'active') {
    throw new Error('Desktop workspace membership is unavailable')
  }

  return {
    runtimeMode: 'desktop',
    authType: 'desktop',
    actorId: identity.userId,
    workspaceId: identity.workspaceId,
    membershipId: membership.id,
    roleKey: membership.role.key,
    permissions: membership.role.permissions.map((entry) => entry.permission),
    sessionId: identity.sessionId,
  }
}
