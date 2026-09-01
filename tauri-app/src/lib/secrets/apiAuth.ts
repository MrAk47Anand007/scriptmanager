import type { PrismaClient } from '@prisma/client'
import { resolveResourceSecret, storeResourceSecret } from './migration'

const SECRET_AUTH_FIELDS = new Set(['token', 'password', 'keyValue', 'accessToken', 'refreshToken', 'clientSecret'])
type ApiSecretContext = { workspaceId?: string; actorId?: string }

function parseConfig(input: unknown): Record<string, string> {
  if (typeof input === 'string') {
    try { return JSON.parse(input) as Record<string, string> } catch { return {} }
  }
  return input && typeof input === 'object' ? { ...(input as Record<string, string>) } : {}
}

export async function vaultApiAuthConfig(database: PrismaClient, requestId: string, input: unknown, context: ApiSecretContext = {}) {
  const config = parseConfig(input)
  for (const [field, value] of Object.entries(config)) {
    if (!SECRET_AUTH_FIELDS.has(field) || typeof value !== 'string' || !value || value.startsWith('secretref:')) continue
    config[field] = await storeResourceSecret(database, { resourceType: 'api-request', resourceId: requestId, field, name: `api:${requestId}:${field}`, workspaceId: context.workspaceId }, value, context.actorId)
  }
  return JSON.stringify(config)
}

export async function resolveApiAuthConfig(database: PrismaClient, requestId: string, input: unknown, context: ApiSecretContext = {}) {
  const config = parseConfig(input)
  for (const [field, value] of Object.entries(config)) {
    if (SECRET_AUTH_FIELDS.has(field) && typeof value === 'string' && value.startsWith('secretref:')) {
      config[field] = await resolveResourceSecret(database, value, { resourceType: 'api-request', resourceId: requestId, field, workspaceId: context.workspaceId }, context.actorId ?? 'api-runtime') ?? ''
    }
  }
  return config
}
