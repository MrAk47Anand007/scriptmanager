import type { PrismaClient } from '@prisma/client'
import { resolveResourceSecret, storeResourceSecret } from './migration'

const SECRET_FIELDS = new Set(['url', 'password', 'token', 'apiKey'])
type NotificationSecretContext = { workspaceId?: string; actorId?: string }

export async function vaultNotificationConfig(database: PrismaClient, channelId: string, input: unknown, context: NotificationSecretContext = {}) {
  const config = input && typeof input === 'object' ? { ...(input as Record<string, unknown>) } : {}
  for (const [field, value] of Object.entries(config)) {
    if (SECRET_FIELDS.has(field) && typeof value === 'string' && value && !value.startsWith('secretref:')) {
      config[field] = await storeResourceSecret(database, { resourceType: 'notification-channel', resourceId: channelId, field, name: `notification:${channelId}:${field}`, workspaceId: context.workspaceId }, value, context.actorId)
    }
  }
  return config
}

export async function resolveNotificationConfig(database: PrismaClient, channelId: string, input: string, workspaceId = 'default') {
  const config = JSON.parse(input || '{}') as Record<string, unknown>
  for (const [field, value] of Object.entries(config)) {
    if (SECRET_FIELDS.has(field) && typeof value === 'string' && value.startsWith('secretref:')) {
      config[field] = await resolveResourceSecret(database, value, { resourceType: 'notification-channel', resourceId: channelId, field, workspaceId }, 'notification-runtime')
    }
  }
  return config
}
