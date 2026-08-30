import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createExecutionEvent } from '@/lib/execution/events'
import { dispatchNotificationEvent, processPendingNotificationDeliveries } from '@/lib/notifications/dispatcher'

describe('notification dispatcher',()=>{
  beforeEach(async()=>{await prisma.notificationDelivery.deleteMany();await prisma.notificationRule.deleteMany();await prisma.notificationChannel.deleteMany()})
  it('delivers once and audits the payload',async()=>{
    const channel=await prisma.notificationChannel.create({data:{name:'Test',kind:'webhook'}})
    await prisma.notificationRule.create({data:{channelId:channel.id,name:'Failures',eventTypes:'execution.failed',templateJson:'{"title":"Failure","body":"{{target}}"}'}})
    const send=vi.fn(async()=>{})
    const event=createExecutionEvent({type:'execution.failed',executionKind:'workflow',correlationId:'c',actor:{type:'system',id:'s'},target:{type:'workflow',id:'w'},data:{}})
    await dispatchNotificationEvent(prisma,event,{webhook:{send}});await dispatchNotificationEvent(prisma,event,{webhook:{send}})
    expect(send).toHaveBeenCalledTimes(1);expect(await prisma.notificationDelivery.count({where:{status:'delivered'}})).toBe(1)
  })

  it('retries due deliveries and marks the third failed attempt terminal', async () => {
    const channel = await prisma.notificationChannel.create({ data: { name: 'Retry webhook', kind: 'webhook' } })
    const delivery = await prisma.notificationDelivery.create({
      data: {
        channelId: channel.id,
        dedupeKey: 'retry-test',
        status: 'retrying',
        attemptCount: 1,
        nextAttemptAt: new Date(Date.now() - 1_000),
        payloadJson: JSON.stringify({ title: 'Retry', body: 'Try again' }),
      },
    })
    const send = vi.fn().mockRejectedValueOnce(new Error('temporary outage'))

    await expect(processPendingNotificationDeliveries(prisma, { webhook: { send } })).resolves.toMatchObject({ processed: 1, retrying: 1, failed: 0 })
    await expect(prisma.notificationDelivery.findUnique({ where: { id: delivery.id } })).resolves.toMatchObject({ status: 'retrying', attemptCount: 2 })

    await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { nextAttemptAt: new Date(Date.now() - 1_000) } })
    send.mockRejectedValueOnce(new Error('permanent outage'))
    await expect(processPendingNotificationDeliveries(prisma, { webhook: { send } })).resolves.toMatchObject({ processed: 1, retrying: 0, failed: 1 })
    await expect(prisma.notificationDelivery.findUnique({ where: { id: delivery.id } })).resolves.toMatchObject({ status: 'failed', attemptCount: 3, nextAttemptAt: null })
    expect(send).toHaveBeenCalledTimes(2)
  })
})
