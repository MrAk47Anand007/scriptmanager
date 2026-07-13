import type { SecretAccessContext } from './types'

export function resourceMatchesBinding(
  resource: string,
  binding: { resourceType: string; resourceId: string },
): boolean {
  return resource === `${binding.resourceType}:${binding.resourceId}`
}

export function canReadSecret(context: SecretAccessContext): boolean {
  return context.capability === 'secret:read' || context.capability === 'secret:reveal'
}
