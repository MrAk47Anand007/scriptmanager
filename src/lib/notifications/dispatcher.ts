import type { PrismaClient } from '@prisma/client'
import type { ExecutionEvent } from '@/lib/execution/events'
import { notificationAdapters, type NotificationAdapter } from './adapters'
import { matchesNotificationRule } from './matcher'
import { renderNotification } from './template'

export async function dispatchNotificationEvent(database: PrismaClient, event: ExecutionEvent, adapters: Record<string, NotificationAdapter> = notificationAdapters) {
  const rules = await database.notificationRule.findMany({ where:{enabled:true,channel:{enabled:true}}, include:{channel:true} })
  const outcomes: Array<{ruleId:string;status:string}> = []
  for (const rule of rules) {
    if (!matchesNotificationRule(event, rule.eventTypes, rule.filterJson)) continue
    const dedupeKey = `${rule.id}:${event.id}`
    if (await database.notificationDelivery.findUnique({ where:{dedupeKey} })) continue
    if (rule.throttleSeconds > 0) {
      const recent = await database.notificationDelivery.findFirst({ where:{ruleId:rule.id,status:'delivered',deliveredAt:{gte:new Date(Date.now()-rule.throttleSeconds*1000)}} })
      if (recent) { outcomes.push({ruleId:rule.id,status:'throttled'}); continue }
    }
    const message = renderNotification(rule.templateJson, event)
    const delivery = await database.notificationDelivery.create({ data:{channelId:rule.channelId,ruleId:rule.id,eventId:event.id,dedupeKey,payloadJson:JSON.stringify(message)} })
    try {
      await adapters[rule.channel.kind].send(JSON.parse(rule.channel.configJson), message)
      await database.notificationDelivery.update({where:{id:delivery.id},data:{status:'delivered',attemptCount:1,deliveredAt:new Date()}})
      outcomes.push({ruleId:rule.id,status:'delivered'})
    } catch (error) {
      await database.notificationDelivery.update({where:{id:delivery.id},data:{status:'retrying',attemptCount:1,lastError:error instanceof Error?error.message:String(error),nextAttemptAt:new Date(Date.now()+30_000)}})
      outcomes.push({ruleId:rule.id,status:'retrying'})
    }
  }
  return outcomes
}
