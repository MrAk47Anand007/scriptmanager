import type { PrismaClient } from '@prisma/client'
import { resolveResourceSecret, storeResourceSecret } from './migration'

const SECRET_FIELDS = new Set(['url', 'password', 'token', 'apiKey'])

export async function vaultNotificationConfig(database: PrismaClient, channelId: string, input: unknown) {
  const config = input && typeof input === 'object' ? { ...(input as Record<string, unknown>) } : {}
  for (const [field, value] of Object.entries(config)) {
    if (SECRET_FIELDS.has(field) && typeof value === 'string' && value && !value.startsWith('secretref:')) {
      config[field] = await storeResourceSecret(database, { resourceType: 'notification-channel', resourceId: channelId, field, name: `notification:${channelId}:${field}` }, value)
    }
  }
  return config
}

export async function resolveNotificationConfig(database: PrismaClient, channelId: string, input: string) {
  const config = JSON.parse(input || '{}') as Record<string, unknown>
  for (const [field, value] of Object.entries(config)) {
    if (SECRET_FIELDS.has(field) && typeof value === 'string' && value.startsWith('secretref:')) {
      config[field] = await resolveResourceSecret(database, value, { resourceType: 'notification-channel', resourceId: channelId, field }, 'notification-runtime')
    }
  }
  return config
}
