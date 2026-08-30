import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, hashApiToken, hashPassword, SESSION_COOKIE, verifyPassword } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as readApiToken, POST as createApiToken, DELETE as revokeApiToken } from '@/app/api/auth/api-token/route'
import { POST as changePassword } from '@/app/api/auth/change-password/route'
import { POST as logout } from '@/app/api/auth/logout/route'

let sessionId = ''
let sessionCookie = ''

describe('account control route authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.setting.upsert({
      where: { key: 'auth_password_hash' },
      update: { value: await hashPassword('old-password') },
      create: { key: 'auth_password_hash', value: await hashPassword('old-password') },
    })
    await prisma.setting.deleteMany({ where: { key: 'api_token_hash' } })

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({
      data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) },
    })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
    await prisma.setting.deleteMany({ where: { key: 'api_token_hash' } })
  })

  it('rejects unauthenticated account controls', async () => {
    expect((await readApiToken(new Request('http://localhost/api/auth/api-token'))).status).toBe(401)
    expect((await createApiToken(new Request('http://localhost/api/auth/api-token', { method: 'POST' }))).status).toBe(401)
    expect((await revokeApiToken(new Request('http://localhost/api/auth/api-token', { method: 'DELETE' }))).status).toBe(401)
    expect((await changePassword(new Request('http://localhost/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'old-password', newPassword: 'new-password' }),
    }))).status).toBe(401)
  })

  it('allows the authenticated owner to rotate and revoke the API token', async () => {
    const created = await createApiToken(new Request('http://localhost/api/auth/api-token', { method: 'POST', headers: { cookie: sessionCookie } }))
    expect(created.status).toBe(200)
    const token = (await created.json() as { token: string }).token
    expect(token).toMatch(/^smt_/)
    expect(await prisma.setting.findUnique({ where: { key: 'api_token_hash' } })).toMatchObject({ value: hashApiToken(token) })

    expect((await readApiToken(new Request('http://localhost/api/auth/api-token', { headers: { cookie: sessionCookie } }))).status).toBe(200)
    expect((await revokeApiToken(new Request('http://localhost/api/auth/api-token', { method: 'DELETE', headers: { cookie: sessionCookie } }))).status).toBe(200)
    expect(await prisma.setting.findUnique({ where: { key: 'api_token_hash' } })).toBeNull()
  })

  it('requires the current password for an authenticated password change', async () => {
    const response = await changePassword(new Request('http://localhost/api/auth/change-password', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'old-password', newPassword: 'new-password' }),
    }))

    expect(response.status).toBe(200)
    const stored = await prisma.setting.findUniqueOrThrow({ where: { key: 'auth_password_hash' } })
    expect(stored.value).not.toBeNull()
    expect(await verifyPassword('new-password', stored.value!)).toBe(true)
  })

  it('revokes the persisted session on logout', async () => {
    const response = await logout(new Request('http://localhost/api/auth/logout', { method: 'POST', headers: { cookie: sessionCookie } }))
    expect(response.status).toBe(200)
    expect((await prisma.userSession.findUniqueOrThrow({ where: { id: sessionId } })).revokedAt).not.toBeNull()
  })
})
