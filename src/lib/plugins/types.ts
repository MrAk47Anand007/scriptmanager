export const PLUGIN_API_VERSION = '1.0.0'
export const PLUGIN_CAPABILITIES = ['http:request', 'events:emit', 'vault:reference', 'storage:access', 'notifications:send', 'desktop:request'] as const
export type PluginCapability = typeof PLUGIN_CAPABILITIES[number]
export type PluginLifecycleHook = 'activate' | 'deactivate' | 'healthCheck'
export type JsonSchema = { type: 'object'; properties?: Record<string, { type: 'string' | 'number' | 'boolean'; secret?: boolean }>; required?: string[]; additionalProperties?: boolean }

export type PluginNodeDefinition = {
  type: string
  name: string
  description?: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

export type PluginManifestV1 = {
  manifestVersion: 1
  id: string
  name: string
  version: string
  compatibility: string
  capabilities: PluginCapability[]
  settingsSchema: JsonSchema
  nodes: PluginNodeDefinition[]
  lifecycle: PluginLifecycleHook[]
  updateUrl?: string
}

export type PluginExecutionContext = { workspaceId: string; actorId: string; permissions: string[]; correlationId: string }
export type PluginHost = {
  http(request: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<unknown>
  emit(type: string, data: Record<string, unknown>): Promise<void>
  secretReference(value: string): string
  storage(operation: string, input: Record<string, unknown>): Promise<unknown>
  notify(input: Record<string, unknown>): Promise<unknown>
  desktop(capability: string, input: Record<string, unknown>): Promise<unknown>
}

export type PluginRuntime = {
  executeNode(type: string, config: Record<string, unknown>, input: unknown, host: PluginHost): Promise<unknown>
  activate?(host: PluginHost): Promise<void>
  deactivate?(host: PluginHost): Promise<void>
  healthCheck?(host: PluginHost): Promise<{ healthy: boolean; message?: string }>
}
