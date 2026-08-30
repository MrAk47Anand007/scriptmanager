import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as readSettings, POST as saveSettings } from '@/app/api/settings/route'
import { GET as readGistSettings, POST as saveGistSettings, DELETE as clearGistSettings } from '@/app/api/settings/github-gist/route'

let sessionId = ''
let sessionCookie = ''

describe('settings route authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({
      data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) },
    })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
    await prisma.setting.delete({ where: { key: 'settings-route-test' } }).catch(() => undefined)
  })

  it('rejects unauthenticated settings and credential-status reads', async () => {
    await expect(readSettings(new Request('http://localhost/api/settings'))).resolves.toMatchObject({ status: 401 })
    await expect(readGistSettings(new Request('http://localhost/api/settings/github-gist'))).resolves.toMatchObject({ status: 401 })
  })

  it('rejects non-string settings values and persists authenticated public settings', async () => {
    const invalid = await saveSettings(new Request('http://localhost/api/settings', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ 'settings-route-test': 42 }),
    }))
    expect(invalid.status).toBe(400)

    const saved = await saveSettings(new Request('http://localhost/api/settings', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ 'settings-route-test': 'ok' }),
    }))
    expect(saved.status).toBe(200)
    const read = await readSettings(new Request('http://localhost/api/settings', { headers: { cookie: sessionCookie } }))
    await expect(read.json()).resolves.toMatchObject({ 'settings-route-test': 'ok' })
  })

  it('requires session management permission for settings mutations', async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId: 'default', key: 'viewer' } } })
    await prisma.membership.updateMany({ where: { userId: 'local-admin', workspaceId: 'default' }, data: { roleId: viewerRole.id } })

    const settingsResponse = await saveSettings(new Request('http://localhost/api/settings', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ 'settings-route-test': 'blocked' }),
    }))
    const gistResponse = await saveGistSettings(new Request('http://localhost/api/settings/github-gist', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ syncEnabled: true }),
    }))
    const clearGistResponse = await clearGistSettings(new Request('http://localhost/api/settings/github-gist', {
      method: 'DELETE',
      headers: { cookie: sessionCookie },
    }))

    expect(settingsResponse.status).toBe(403)
    expect(gistResponse.status).toBe(403)
    expect(clearGistResponse.status).toBe(403)
  })
})
