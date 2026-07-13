import crypto from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { RBAC_RESOURCES } from './catalog'

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

export function createTeamAdminService(database: PrismaClient) {
  const audit = (workspaceId: string, actorId: string, type: string, targetType: string, targetId: string) => database.executionEvent.create({ data: {
    id: crypto.randomUUID(), type, executionKind: 'workspace_admin', correlationId: crypto.randomUUID(), occurredAt: new Date(),
    actorType: 'user', actorId, targetType, targetId, dataJson: JSON.stringify({ workspaceId }),
  } })
  return {
    listMembers(workspaceId: string) {
      return database.membership.findMany({ where: { workspaceId }, include: { user: true, role: true }, orderBy: { joinedAt: 'asc' } })
    },
    listRoles(workspaceId: string) {
      return database.role.findMany({ where: { workspaceId }, include: { permissions: true, _count: { select: { memberships: true } } }, orderBy: [{ preset: 'desc' }, { name: 'asc' }] })
    },
    listInvitations(workspaceId: string) {
      return database.workspaceInvitation.findMany({ where: { workspaceId, status: 'pending' }, include: { role: true }, orderBy: { createdAt: 'desc' } })
    },
    async createRole(workspaceId: string, actorId: string, input: { name: string; description?: string; permissions: string[] }) {
      const name = input.name.trim()
      if (!name) throw new Error('Role name is required')
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const permissions = normalizePermissions(input.permissions)
      const role = await database.$transaction(async (tx) => {
        const created = await tx.role.create({ data: { workspaceId, key, name, description: input.description ?? '', preset: false } })
        await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: created.id, permission })) })
        return created
      })
      await audit(workspaceId, actorId, 'workspace.role.created', 'role', role.id)
      return role
    },
    async invite(input: { workspaceId: string; email: string; roleId: string; invitedById: string }) {
      const role = await database.role.findFirst({ where: { id: input.roleId, workspaceId: input.workspaceId } })
      if (!role) throw new Error('Role does not belong to this workspace')
      const token = `smi_${crypto.randomBytes(32).toString('base64url')}`
      const invitation = await database.workspaceInvitation.create({ data: { ...input, email: input.email.trim().toLowerCase(), tokenHash: hash(token), expiresAt: new Date(Date.now() + 7 * 86_400_000) } })
      await audit(input.workspaceId, input.invitedById, 'workspace.invitation.created', 'invitation', invitation.id)
      return { invitation, token }
    },
    async updateMembershipRole(workspaceId: string, membershipId: string, roleId: string) {
      const [membership, role] = await Promise.all([
        database.membership.findFirst({ where: { id: membershipId, workspaceId }, include: { role: true } }),
        database.role.findFirst({ where: { id: roleId, workspaceId } }),
      ])
      if (!membership || !role) throw new Error('Membership or role not found')
      if (membership.role.key === 'owner' && role.key !== 'owner') await assertAnotherOwner(database, workspaceId)
      const updated = await database.membership.update({ where: { id: membershipId }, data: { roleId } })
      await audit(workspaceId, membership.userId, 'workspace.membership.role_changed', 'membership', membershipId)
      return updated
    },
    async revokeMembership(workspaceId: string, membershipId: string) {
      const membership = await database.membership.findUnique({ where: { id: membershipId }, include: { role: true } })
      if (!membership || membership.workspaceId !== workspaceId) throw new Error('Membership not found')
      if (membership.role.key === 'owner') await assertAnotherOwner(database, workspaceId)
      await database.userSession.updateMany({ where: { userId: membership.userId, workspaceId, revokedAt: null }, data: { revokedAt: new Date() } })
      const updated = await database.membership.update({ where: { id: membershipId }, data: { status: 'revoked' } })
      await audit(workspaceId, membership.userId, 'workspace.membership.revoked', 'membership', membershipId)
      return updated
    },
    listSessions(workspaceId: string) {
      return database.userSession.findMany({ where: { workspaceId }, include: { user: true }, orderBy: { lastSeenAt: 'desc' } })
    },
    async revokeSession(workspaceId: string, sessionId: string, actorId = 'system') {
      const result = await database.userSession.updateMany({ where: { id: sessionId, workspaceId, revokedAt: null }, data: { revokedAt: new Date() } })
      if (result.count) await audit(workspaceId, actorId, 'workspace.session.revoked', 'session', sessionId)
      return result
    },
    async revokeGrants(workspaceId: string, actorId?: string) {
      const where = { workspaceId, revokedAt: null, ...(actorId ? { actorId } : {}) }
      const result = await Promise.all([
        database.approvalGrant.updateMany({ where, data: { revokedAt: new Date() } }),
        database.permissionGrant.updateMany({ where: { revokedAt: null, run: { workspaceId, ...(actorId ? { initiatedBy: actorId } : {}) } }, data: { revokedAt: new Date() } }),
      ])
      await audit(workspaceId, actorId ?? 'system', 'workspace.grants.revoked', 'workspace', workspaceId)
      return result
    },
    listAudit(workspaceId: string) {
      return database.executionEvent.findMany({ where: { dataJson: { contains: `"workspaceId":"${workspaceId}"` } }, orderBy: { occurredAt: 'desc' }, take: 200 })
    },
  }
}

function normalizePermissions(permissions: string[]) {
  const allowedActions = new Set(['*', 'create', 'read', 'update', 'delete', 'run', 'approve', 'reveal', 'manage'])
  return [...new Set(permissions)].filter((permission) => {
    const [resource, action, extra] = permission.split(':')
    return !extra && (resource === '*' || RBAC_RESOURCES.includes(resource as never)) && allowedActions.has(action)
  }).sort()
}

async function assertAnotherOwner(database: PrismaClient, workspaceId: string) {
  const owners = await database.membership.count({ where: { workspaceId, status: 'active', role: { key: 'owner' } } })
  if (owners <= 1) throw new Error('Cannot remove or demote the last workspace owner')
}
