import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET } from '@/app/api/bootstrap/route'

let sessionId = ''
let sessionCookie = ''
let scriptIds: string[] = []

describe('bootstrap route authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    scriptIds = [crypto.randomUUID(), crypto.randomUUID()]
    await prisma.script.createMany({
      data: [
        { id: scriptIds[0], workspaceId: 'default', name: 'Default bootstrap script', filename: 'default.py' },
        { id: scriptIds[1], workspaceId: 'foreign-workspace', name: 'Foreign bootstrap script', filename: 'foreign.py' },
      ],
    })
    await prisma.setting.upsert({ where: { key: 'github_token' }, update: { value: 'should-not-leak' }, create: { key: 'github_token', value: 'should-not-leak' } })

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({
      data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) },
    })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.script.deleteMany({ where: { id: { in: scriptIds } } })
    await prisma.setting.delete({ where: { key: 'github_token' } }).catch(() => undefined)
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated bootstrap requests', async () => {
    const response = await GET(new Request('http://localhost/api/bootstrap'))
    expect(response.status).toBe(401)
  })

  it('returns only the trusted workspace scripts and never public-secret settings', async () => {
    const response = await GET(new Request('http://localhost/api/bootstrap', {
      headers: { cookie: sessionCookie, 'x-scriptmanager-workspace-id': 'foreign-workspace' },
    }))
    expect(response.status).toBe(200)
    const body = await response.json()
    const scriptResponseIds = body.scripts.map((script: { id: string }) => script.id)
    expect(scriptResponseIds).toContain(scriptIds[0])
    expect(scriptResponseIds).not.toContain(scriptIds[1])
    expect(body.settings.github_token).toBeUndefined()
  })
})
