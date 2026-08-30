import crypto from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { ExecutionEvent } from '@/lib/execution/events'
import { notificationAdapters, type NotificationAdapter } from './adapters'
import { matchesNotificationRule } from './matcher'
import { renderNotification } from './template'
import { resolveNotificationConfig } from '@/lib/secrets/notificationConfig'

type DirectNotificationOptions = {
  workspaceId: string
  channelId?: string
  channelKind?: string
  message: { title: string; body: string; deepLink?: string }
  dedupeKey?: string
}

export const MAX_NOTIFICATION_ATTEMPTS = 3
const NOTIFICATION_RETRY_DELAY_MS = 30_000

function boundedMessage(message: DirectNotificationOptions['message']) {
  return {
    title: String(message.title || 'ScriptManager event').slice(0, 200),
    body: String(message.body || '').slice(0, 4000),
    ...(message.deepLink ? { deepLink: String(message.deepLink).slice(0, 1000) } : {}),
  }
}

export async function dispatchNotificationToChannel(
  database: PrismaClient,
  options: DirectNotificationOptions,
  adapters: Record<string, NotificationAdapter> = notificationAdapters,
) {
  const channel = await database.notificationChannel.findFirst({
    where: {
      workspaceId: options.workspaceId,
      enabled: true,
      ...(options.channelId ? { id: options.channelId } : { kind: options.channelKind ?? 'desktop' }),
    },
  })
  if (!channel) throw new Error('Notification channel not found')
  const adapter = adapters[channel.kind]
  if (!adapter) throw new Error(`Unsupported notification channel: ${channel.kind}`)
  const message = boundedMessage(options.message)
  const dedupeKey = options.dedupeKey ?? `direct:${options.workspaceId}:${channel.id}:${crypto.randomUUID()}`
  const existing = await database.notificationDelivery.findUnique({ where: { dedupeKey } })
  if (existing) return { status: existing.status, deliveryId: existing.id, channelId: channel.id }
  const delivery = await database.notificationDelivery.create({ data: { workspaceId: options.workspaceId, channelId: channel.id, dedupeKey, payloadJson: JSON.stringify(message) } })
  try {
    await adapter.send(await resolveNotificationConfig(database, channel.id, channel.configJson, options.workspaceId), message)
    await database.notificationDelivery.update({ where: { id: delivery.id }, data: { status: 'delivered', attemptCount: 1, deliveredAt: new Date() } })
    return { status: 'delivered', deliveryId: delivery.id, channelId: channel.id }
  } catch (error) {
    await database.notificationDelivery.update({ where: { id: delivery.id }, data: { status: 'retrying', attemptCount: 1, lastError: error instanceof Error ? error.message : String(error), nextAttemptAt: new Date(Date.now() + 30_000) } })
    return { status: 'retrying', deliveryId: delivery.id, channelId: channel.id }
  }
}

type StoredNotificationPayload = { title: string; body: string; deepLink?: string }

function parseStoredNotificationPayload(payloadJson: string): StoredNotificationPayload {
  const payload = JSON.parse(payloadJson || '{}') as Partial<StoredNotificationPayload>
  if (typeof payload.title !== 'string' || typeof payload.body !== 'string') {
    throw new Error('Notification payload is invalid')
  }
  return {
    title: payload.title.slice(0, 200),
    body: payload.body.slice(0, 4000),
    ...(typeof payload.deepLink === 'string' ? { deepLink: payload.deepLink.slice(0, 1000) } : {}),
  }
}

export type NotificationDeliveryProcessingSummary = {
  processed: number
  delivered: number
  retrying: number
  failed: number
}

/**
 * Deliver persisted failures after their backoff. The server starts one loop
 * for this function; the claim update prevents duplicate sends if two server
 * instances happen to poll at the same time.
 */
export async function processPendingNotificationDeliveries(
  database: PrismaClient,
  adapters: Record<string, NotificationAdapter> = notificationAdapters,
  now = new Date(),
  limit = 50,
): Promise<NotificationDeliveryProcessingSummary> {
  const summary: NotificationDeliveryProcessingSummary = { processed: 0, delivered: 0, retrying: 0, failed: 0 }
  const deliveries = await database.notificationDelivery.findMany({
    where: { status: 'retrying', nextAttemptAt: { lte: now } },
    include: { channel: true },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, Math.min(limit, 100)),
  })

  for (const delivery of deliveries) {
    const claim = await database.notificationDelivery.updateMany({
      where: { id: delivery.id, status: 'retrying' },
      data: { status: 'sending' },
    })
    if (claim.count !== 1) continue

    summary.processed += 1
    const attemptCount = delivery.attemptCount + 1
    try {
      if (!delivery.channel.enabled) throw new Error('Notification channel is disabled')
      if (attemptCount > MAX_NOTIFICATION_ATTEMPTS) throw new Error('Notification retry limit reached')
      const adapter = adapters[delivery.channel.kind]
      if (!adapter) throw new Error(`Unsupported notification channel: ${delivery.channel.kind}`)
      const payload = parseStoredNotificationPayload(delivery.payloadJson)
      await adapter.send(await resolveNotificationConfig(database, delivery.channel.id, delivery.channel.configJson, delivery.workspaceId), payload)
      await database.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: 'delivered', attemptCount, lastError: null, nextAttemptAt: null, deliveredAt: new Date() },
      })
      summary.delivered += 1
    } catch (error) {
      const lastError = error instanceof Error ? error.message : String(error)
      const terminal = attemptCount >= MAX_NOTIFICATION_ATTEMPTS || lastError === 'Notification channel is disabled' || lastError === 'Notification retry limit reached'
      await database.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: terminal ? 'failed' : 'retrying',
          attemptCount,
          lastError,
          nextAttemptAt: terminal ? null : new Date(now.getTime() + NOTIFICATION_RETRY_DELAY_MS * Math.max(1, attemptCount)),
        },
      })
      if (terminal) summary.failed += 1
      else summary.retrying += 1
    }
  }
  return summary
}

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
