import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as listChannels, POST as createChannel } from '@/app/api/notifications/channels/route'
import { GET as listRules, POST as createRule } from '@/app/api/notifications/rules/route'
import { GET as listDeliveries } from '@/app/api/notifications/deliveries/route'

let sessionId = ''
let sessionCookie = ''
let localChannelId = ''
let foreignChannelId = ''

describe('notification route authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.notificationDelivery.deleteMany()
    await prisma.notificationRule.deleteMany()
    await prisma.notificationChannel.deleteMany()

    const local = await prisma.notificationChannel.create({ data: { id: `local_channel_${crypto.randomUUID()}`, workspaceId: 'default', name: 'Local channel', kind: 'desktop' } })
    const foreign = await prisma.notificationChannel.create({ data: { id: `foreign_channel_${crypto.randomUUID()}`, workspaceId: 'foreign-workspace', name: 'Foreign channel', kind: 'desktop' } })
    localChannelId = local.id
    foreignChannelId = foreign.id
    await prisma.notificationRule.create({ data: { channelId: foreignChannelId, workspaceId: 'foreign-workspace', name: 'Foreign rule', eventTypes: 'execution.failed' } })

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({ data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) } })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated notification access', async () => {
    expect((await listChannels(new Request('http://localhost/api/notifications/channels'))).status).toBe(401)
    expect((await listRules(new Request('http://localhost/api/notifications/rules'))).status).toBe(401)
    expect((await listDeliveries(new Request('http://localhost/api/notifications/deliveries'))).status).toBe(401)
  })

  it('lists only notification configuration from the authenticated workspace', async () => {
    const headers = { cookie: sessionCookie, 'x-scriptmanager-workspace-id': 'foreign-workspace' }
    const channelsResponse = await listChannels(new Request('http://localhost/api/notifications/channels', { headers }))
    expect(channelsResponse.status).toBe(200)
    expect((await channelsResponse.json() as Array<{ id: string }>).map((channel) => channel.id)).toEqual([localChannelId])

    const rulesResponse = await listRules(new Request('http://localhost/api/notifications/rules', { headers }))
    expect(rulesResponse.status).toBe(200)
    expect((await rulesResponse.json() as Array<{ channelId: string }>).some((rule) => rule.channelId === foreignChannelId)).toBe(false)
  })

  it('creates channels in the trusted workspace and rejects foreign rule channels', async () => {
    const channelResponse = await createChannel(new Request('http://localhost/api/notifications/channels', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-scriptmanager-workspace-id': 'foreign-workspace' },
      body: JSON.stringify({ name: 'Trusted channel', kind: 'desktop' }),
    }))
    expect(channelResponse.status).toBe(201)
    const created = await prisma.notificationChannel.findFirstOrThrow({ where: { name: 'Trusted channel' } })
    expect(created.workspaceId).toBe('default')

    const ruleResponse = await createRule(new Request('http://localhost/api/notifications/rules', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ channelId: foreignChannelId, name: 'Tampered rule', eventTypes: 'execution.failed' }),
    }))
    expect(ruleResponse.status).toBe(404)
  })
})
