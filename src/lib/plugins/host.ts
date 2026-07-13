import { permissionAllows } from '@/lib/rbac/authorization'
import type { PluginCapability, PluginExecutionContext, PluginHost } from './types'

export type PluginHostAdapters = {
  http?(context: PluginExecutionContext, request: Parameters<PluginHost['http']>[0]): Promise<unknown>
  emit?(context: PluginExecutionContext, type: string, data: Record<string, unknown>): Promise<void>
  storage?(context: PluginExecutionContext, operation: string, input: Record<string, unknown>): Promise<unknown>
  notify?(context: PluginExecutionContext, input: Record<string, unknown>): Promise<unknown>
  desktop?(context: PluginExecutionContext, capability: string, input: Record<string, unknown>): Promise<unknown>
}

export function createPluginHost(context: PluginExecutionContext, manifest: { capabilities: readonly PluginCapability[] }, adapters: PluginHostAdapters): PluginHost {
  if (!permissionAllows(context.permissions, 'plugin', 'run')) throw new Error('plugin run permission denied')
  const requireCapability = (capability: string) => { if (!(manifest.capabilities as readonly string[]).includes(capability)) throw new Error(`plugin capability not declared: ${capability}`) }
  return {
    async http(request) { requireCapability('http:request'); if (!adapters.http) throw new Error('HTTP host unavailable'); return adapters.http(context, request) },
    async emit(type, data) { requireCapability('events:emit'); if (!adapters.emit) throw new Error('event host unavailable'); return adapters.emit(context, type, data) },
    secretReference(value) { requireCapability('vault:reference'); if (!/^secret:\/\/[A-Za-z0-9._-]+$/.test(value)) throw new Error('invalid opaque secret reference'); return value },
    async storage(operation, input) { requireCapability('storage:access'); if (!adapters.storage) throw new Error('storage host unavailable'); return adapters.storage(context, operation, input) },
    async notify(input) { requireCapability('notifications:send'); if (!adapters.notify) throw new Error('notification host unavailable'); return adapters.notify(context, input) },
    async desktop(capability, input) { requireCapability('desktop:request'); if (!adapters.desktop) throw new Error('desktop host unavailable'); return adapters.desktop(context, capability, input) },
  }
}
