import crypto from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { parseSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { isDesktopSessionToken } from '@/lib/session'
import { ensureDefaultWorkspace } from './bootstrap'
import type { AuthorizationContext } from './types'

export const hashSessionToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

export async function resolveRequestContext(request: Request | NextRequest, database: PrismaClient = prisma): Promise<AuthorizationContext | null> {
  const cookie = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1)
  const token = cookie ? decodeURIComponent(cookie) : undefined
  const desktopSession = isDesktopSessionToken(token)
  const payload = desktopSession ? {} : parseSessionToken(token)
  if (!desktopSession && !payload) return null
  const identity = payload.userId && payload.workspaceId ? payload : { ...payload, ...(await ensureDefaultWorkspace(database)) }
  if (identity.sessionId) {
    const session = await database.userSession.findUnique({ where: { id: identity.sessionId } })
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.tokenHash !== hashSessionToken(token!)) return null
  }
  const membership = await database.membership.findUnique({
    where: { userId_workspaceId: { userId: identity.userId!, workspaceId: identity.workspaceId! } },
    include: { role: { include: { permissions: true } } },
  })
  if (!membership || membership.status !== 'active') return null
  return { userId: identity.userId!, workspaceId: identity.workspaceId!, sessionId: identity.sessionId, membershipId: membership.id, roleKey: membership.role.key, permissions: membership.role.permissions.map((entry) => entry.permission) }
}
