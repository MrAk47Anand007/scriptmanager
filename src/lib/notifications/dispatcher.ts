import type { PrismaClient } from '@prisma/client'
import type { ExecutionEvent } from '@/lib/execution/events'
import { notificationAdapters, type NotificationAdapter } from './adapters'
import { matchesNotificationRule } from './matcher'
import { renderNotification } from './template'
import { resolveNotificationConfig } from '@/lib/secrets/notificationConfig'

async function resolveEventWorkspace(database: PrismaClient, event: ExecutionEvent): Promise<string> {
  if (event.executionKind === 'script') return (await database.script.findUnique({ where: { id: event.target.id }, select: { workspaceId: true } }))?.workspaceId ?? 'default'
  if (event.executionKind === 'api') return (await database.apiRequest.findUnique({ where: { id: event.target.id }, select: { workspaceId: true } }))?.workspaceId ?? 'default'
  if (event.executionKind === 'remote') return (await database.remoteExecution.findUnique({ where: { id: event.target.id }, include: { profile: { select: { workspaceId: true } } } }))?.profile.workspaceId ?? 'default'
  if (event.executionKind === 'workflow') return (await database.workflow.findUnique({ where: { id: event.target.id }, select: { workspaceId: true } }))?.workspaceId ?? 'default'
  if (event.executionKind === 'agent') return (await database.agentRun.findUnique({ where: { id: event.target.id }, select: { workspaceId: true } }))?.workspaceId ?? 'default'
  if (event.executionKind === 'git') return (await database.project.findUnique({ where: { id: event.target.id }, select: { workspaceId: true } }))?.workspaceId ?? 'default'
  return 'default'
}

export async function dispatchNotificationEvent(database: PrismaClient, event: ExecutionEvent, adapters: Record<string, NotificationAdapter> = notificationAdapters, workspaceId?: string) {
  const eventWorkspaceId = workspaceId ?? await resolveEventWorkspace(database, event)
  const rules = await database.notificationRule.findMany({ where:{workspaceId:eventWorkspaceId,enabled:true,channel:{workspaceId:eventWorkspaceId,enabled:true}}, include:{channel:true} })
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
    const delivery = await database.notificationDelivery.create({ data:{workspaceId:eventWorkspaceId,channelId:rule.channelId,ruleId:rule.id,eventId:event.id,dedupeKey,payloadJson:JSON.stringify(message)} })
    try {
      await adapters[rule.channel.kind].send(await resolveNotificationConfig(database, rule.channel.id, rule.channel.configJson, eventWorkspaceId), message)
      await database.notificationDelivery.update({where:{id:delivery.id},data:{status:'delivered',attemptCount:1,deliveredAt:new Date()}})
      outcomes.push({ruleId:rule.id,status:'delivered'})
    } catch (error) {
      await database.notificationDelivery.update({where:{id:delivery.id},data:{status:'retrying',attemptCount:1,lastError:error instanceof Error?error.message:String(error),nextAttemptAt:new Date(Date.now()+30_000)}})
      outcomes.push({ruleId:rule.id,status:'retrying'})
    }
  }
  return outcomes
}
