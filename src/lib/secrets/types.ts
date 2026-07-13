export type SecretStoreContext = { secretId: string; version: number }

export type SecretAccessContext = {
  actorType: 'user' | 'system' | 'agent'
  actorId: string
  workspaceId: string
  capability: string
  resource: string
  reason: string
}

export type SecretReference = { secretRef: string }
