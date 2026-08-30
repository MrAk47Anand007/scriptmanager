import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createProductionWorkflowAdapters } from '@/lib/workflows/runtimeAdapters'

describe('workflow notification adapter', () => {
  beforeEach(async () => {
    await prisma.notificationDelivery.deleteMany()
    await prisma.notificationRule.deleteMany()
    await prisma.notificationChannel.deleteMany()
  })

  afterAll(async () => {
    delete (globalThis as typeof globalThis & { scriptManagerNotify?: unknown }).scriptManagerNotify
    await prisma.$disconnect()
  })

  it('sends and audits a workspace notification using the selected channel', async () => {
    const notify = vi.fn(async () => undefined)
    ;(globalThis as typeof globalThis & { scriptManagerNotify?: unknown }).scriptManagerNotify = notify
    const channel = await prisma.notificationChannel.create({ data: { workspaceId: 'workspace-a', name: 'Desktop', kind: 'desktop' } })

    const result = await createProductionWorkflowAdapters('workspace-a').sendNotification({ channelId: channel.id, title: 'Workflow complete', message: 'The build finished.' }, { ignored: 'input' })

    expect(result).toMatchObject({ status: 'delivered', channelId: channel.id })
    expect(notify).toHaveBeenCalledWith({ title: 'Workflow complete', body: 'The build finished.' })
    await expect(prisma.notificationDelivery.findFirst({ where: { channelId: channel.id, workspaceId: 'workspace-a' } })).resolves.toMatchObject({ status: 'delivered' })
  })

  it('persists a desktop delivery when the server process has no Electron callback', async () => {
    delete (globalThis as typeof globalThis & { scriptManagerNotify?: unknown }).scriptManagerNotify
    const channel = await prisma.notificationChannel.create({ data: { workspaceId: 'workspace-a', name: 'Desktop server bridge', kind: 'desktop' } })

    const result = await createProductionWorkflowAdapters('workspace-a').sendNotification({ channelId: channel.id, message: 'queued for the desktop shell' }, {})

    expect(result).toMatchObject({ status: 'delivered', channelId: channel.id })
    await expect(prisma.notificationDelivery.findFirst({ where: { channelId: channel.id, workspaceId: 'workspace-a' } })).resolves.toMatchObject({
      status: 'delivered',
      payloadJson: JSON.stringify({ title: 'Workflow notification', body: 'queued for the desktop shell' }),
    })
  })

  it('does not allow a workflow workspace to address another workspace channel', async () => {
    const channel = await prisma.notificationChannel.create({ data: { workspaceId: 'workspace-b', name: 'Foreign', kind: 'desktop' } })

    await expect(createProductionWorkflowAdapters('workspace-a').sendNotification({ channelId: channel.id, message: 'must not send' }, {})).rejects.toThrow('Notification channel not found')
    await expect(prisma.notificationDelivery.count()).resolves.toBe(0)
  })
})
