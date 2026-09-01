import type { NotificationDelivery } from './notificationsRuntimeClient'

export type DesktopNotificationPayload = { title: string; body: string; deepLink?: string }

export function parseDesktopNotificationPayload(delivery: NotificationDelivery): DesktopNotificationPayload | null {
  if (delivery.status !== 'delivered' || delivery.channel?.kind !== 'desktop' || !delivery.payloadJson) return null
  try {
    const payload = JSON.parse(delivery.payloadJson) as Partial<DesktopNotificationPayload>
    if (typeof payload.title !== 'string' || typeof payload.body !== 'string') return null
    return {
      title: payload.title.slice(0, 120),
      body: payload.body.slice(0, 1000),
      ...(typeof payload.deepLink === 'string' && payload.deepLink.startsWith('/approvals') ? { deepLink: payload.deepLink.slice(0, 1000) } : {}),
    }
  } catch {
    return null
  }
}

export function advanceDesktopNotificationCursor(current: string, delivery: Pick<NotificationDelivery, 'createdAt'>): string {
  return delivery.createdAt > current ? delivery.createdAt : current
}
