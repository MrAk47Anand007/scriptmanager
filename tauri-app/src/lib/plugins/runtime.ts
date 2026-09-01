import { createPluginHost, type PluginHostAdapters } from './host'
import type { PluginCapability, PluginExecutionContext, PluginRuntime } from './types'

type Entry = { runtime: PluginRuntime; enabled: boolean; manifest: { capabilities: readonly PluginCapability[] }; hostAdapters: PluginHostAdapters }

export class PluginRuntimeRegistry {
  private entries = new Map<string, Entry>()
  private key(workspaceId: string, pluginId: string) { return `${workspaceId}:${pluginId}` }
  register(workspaceId: string, pluginId: string, runtime: PluginRuntime, enabled = false, manifest: { capabilities: readonly PluginCapability[] } = { capabilities: [] }, hostAdapters: PluginHostAdapters = {}) { this.entries.set(this.key(workspaceId, pluginId), { runtime, enabled, manifest, hostAdapters }) }
  setEnabled(workspaceId: string, pluginId: string, enabled: boolean) { const entry = this.entries.get(this.key(workspaceId, pluginId)); if (!entry) throw new Error('plugin runtime not installed'); entry.enabled = enabled }
  workflowAdapter(context: PluginExecutionContext) {
    return async (namespacedType: `plugin:${string}:${string}`, config: Record<string, unknown>, input: unknown) => {
      const match = /^plugin:(.+):([^:]+)$/.exec(namespacedType)
      if (!match) throw new Error('invalid plugin node type')
      const [, pluginId, nodeType] = match
      const entry = this.entries.get(this.key(context.workspaceId, pluginId))
      if (!entry) throw new Error('plugin runtime not installed')
      if (!entry.enabled) throw new Error('plugin is disabled')
      return entry.runtime.executeNode(nodeType, config, input, createPluginHost(context, entry.manifest, entry.hostAdapters))
    }
  }
}
