import { prisma } from '@/lib/db'
import { createServerSecretStore } from './serverStore'
import { createSecretVaultService } from './service'

export function defaultSecretVaultService() {
  return createSecretVaultService(prisma, createServerSecretStore())
}
