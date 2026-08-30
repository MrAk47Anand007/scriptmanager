import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'

const { warmTerminalSession } = vi.hoisted(() => ({
  warmTerminalSession: vi.fn(() => true),
}))

vi.mock('@/lib/socketService', () => ({ warmTerminalSession }))

import { POST as warmTerminal } from '@/app/api/terminal/warm/route'

let sessionId = ''
let sessionCookie = ''

describe('terminal warm route authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({
      data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) },
    })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
    warmTerminalSession.mockClear()
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated terminal warm-up', async () => {
    const response = await warmTerminal(new Request('http://localhost/api/terminal/warm', { method: 'POST', body: '{}' }))
    expect(response.status).toBe(401)
    expect(warmTerminalSession).not.toHaveBeenCalled()
  })

  it('requires operational execution permission before warming a terminal', async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId: 'default', key: 'viewer' } } })
    await prisma.membership.updateMany({ where: { userId: 'local-admin', workspaceId: 'default' }, data: { roleId: viewerRole.id } })

    const response = await warmTerminal(new Request('http://localhost/api/terminal/warm', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'terminal-1' }),
    }))

    expect(response.status).toBe(403)
    expect(warmTerminalSession).not.toHaveBeenCalled()
  })
})
