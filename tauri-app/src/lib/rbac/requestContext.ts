import crypto from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { parseSessionToken, SESSION_COOKIE, type SessionPayload, verifyApiToken } from '@/lib/auth'
import { isDesktopSessionToken } from '@/lib/session'
import { ensureDefaultWorkspace } from './bootstrap'
import type { AuthorizationContext } from './types'
import { createDesktopActorContext, type TrustedActorContext } from '@/lib/runtime/trustedContext'

export const hashSessionToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

function readSessionCookie(request: Request | NextRequest): string | undefined {
  const cookie = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1)
  return cookie ? decodeURIComponent(cookie) : undefined
}

async function loadAuthorizationContext(identity: SessionPayload, token: string | undefined, database: PrismaClient): Promise<AuthorizationContext | null> {
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

export async function resolveTrustedRequestContext(request: Request | NextRequest, database: PrismaClient = prisma): Promise<TrustedActorContext | null> {
  const token = readSessionCookie(request)
  if (isDesktopSessionToken(token)) {
    return createDesktopActorContext(database)
  }

  const payload = parseSessionToken(token)
  if (payload) {
    const identity: SessionPayload = payload.userId && payload.workspaceId ? payload : { ...payload, ...(await ensureDefaultWorkspace(database)) }
    const context = await loadAuthorizationContext(identity, token, database)
    if (context) {
      return {
        runtimeMode: 'web',
        authType: 'session',
        actorId: context.userId,
        workspaceId: context.workspaceId,
        membershipId: context.membershipId,
        roleKey: context.roleKey,
        permissions: context.permissions,
        sessionId: context.sessionId,
      }
    }
  }

  return resolveBearerTokenContext(request, database)
}

export async function resolveBearerTokenContext(request: Request | NextRequest, database: PrismaClient = prisma): Promise<TrustedActorContext | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) {
    return null
  }

  const stored = await database.setting.findUnique({ where: { key: 'api_token_hash' } })
  if (!verifyApiToken(token, stored?.value)) {
    return null
  }

  const context = await createDesktopActorContext(database)
  return {
    ...context,
    runtimeMode: 'web',
    authType: 'bearer',
  }
}

export async function resolveRequestContext(request: Request | NextRequest, database: PrismaClient = prisma): Promise<AuthorizationContext | null> {
  const context = await resolveTrustedRequestContext(request, database)
  if (!context) {
    return null
  }

  return {
    userId: context.actorId,
    workspaceId: context.workspaceId,
    membershipId: context.membershipId,
    roleKey: context.roleKey,
    permissions: context.permissions,
    sessionId: context.sessionId,
  }
}
