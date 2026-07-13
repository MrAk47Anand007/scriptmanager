import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createExecutionEvent } from '@/lib/execution/events'
import { dispatchNotificationEvent } from '@/lib/notifications/dispatcher'

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
})
