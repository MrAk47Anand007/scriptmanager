export interface NotificationChannel {
  id: string
  name: string
  kind: string
  enabled?: boolean
  _count?: { rules: number; deliveries: number }
}

export interface NotificationRule {
  id: string
  channelId: string
  name: string
  enabled: boolean
  eventTypes: string
  filterJson: string
  templateJson: string
  throttleSeconds: number
  channel?: Pick<NotificationChannel, 'id' | 'name' | 'kind'>
}

export interface NotificationDelivery {
  id: string
  status: string
  attemptCount: number
  lastError?: string | null
  createdAt: string
  payloadJson?: string
  deliveredAt?: string | null
  channel?: Pick<NotificationChannel, 'id' | 'name' | 'kind'>
  rule?: Pick<NotificationRule, 'id' | 'name'> | null
}

export interface CreateNotificationRulePayload {
  channelId: string
  name: string
  eventTypes: string
  filter?: unknown
  template?: unknown
  throttleSeconds?: number
}

export async function listNotificationChannelsRuntime(): Promise<NotificationChannel[]> {
  if (window.scriptManagerDesktop?.runtime?.listNotificationChannels) {
    return window.scriptManagerDesktop.runtime.listNotificationChannels() as Promise<NotificationChannel[]>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function listNotificationRulesRuntime(): Promise<NotificationRule[]> {
  if (window.scriptManagerDesktop?.runtime?.listNotificationRules) {
    return window.scriptManagerDesktop.runtime.listNotificationRules() as Promise<NotificationRule[]>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function createNotificationRuleRuntime(payload: CreateNotificationRulePayload): Promise<NotificationRule> {
  if (window.scriptManagerDesktop?.runtime?.createNotificationRule) {
    return window.scriptManagerDesktop.runtime.createNotificationRule(payload) as Promise<NotificationRule>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function listNotificationDeliveriesRuntime(since?: string): Promise<NotificationDelivery[]> {
  if (window.scriptManagerDesktop?.runtime?.listNotificationDeliveries) {
    return window.scriptManagerDesktop.runtime.listNotificationDeliveries(since) as Promise<NotificationDelivery[]>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function createNotificationChannelRuntime(payload: { name: string; kind: string; config?: unknown }): Promise<NotificationChannel> {
  if (window.scriptManagerDesktop?.runtime?.createNotificationChannel) {
    return window.scriptManagerDesktop.runtime.createNotificationChannel(payload) as Promise<NotificationChannel>
  }
  throw new Error('Desktop runtime unavailable')
}
