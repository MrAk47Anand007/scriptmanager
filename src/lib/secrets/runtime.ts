import type { PrismaClient } from '@prisma/client'
import { createServerSecretStore } from './serverStore'
import { createSecretVaultService } from './service'
import { parseSecretReference } from './references'
type SecretVaultService = ReturnType<typeof createSecretVaultService>

export async function resolveScriptEnvironment(database: PrismaClient, scriptId: string, entries: Array<{ key: string; value: string; isSecret: boolean }>, service: SecretVaultService = createSecretVaultService(database, createServerSecretStore())) {
  const resolved: Record<string, string> = {}
  for (const entry of entries) {
    resolved[entry.key] = entry.isSecret && entry.value.startsWith('secretref:')
      ? await service.resolveSecret(parseSecretReference(entry.value), { actorType: 'system', actorId: 'script-runtime', workspaceId: 'default', capability: 'secret:read', resource: `script:${scriptId}`, reason: 'script execution' })
      : entry.value
  }
  return resolved
}
