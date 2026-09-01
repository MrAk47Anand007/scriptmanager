import { PLUGIN_API_VERSION, PLUGIN_CAPABILITIES, type PluginLifecycleHook, type PluginManifestV1 } from './types'

const idPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/
const nodePattern = /^[a-z][a-z0-9-]*$/
const semverPattern = /^\d+\.\d+\.\d+$/
const hooks = new Set<PluginLifecycleHook>(['activate', 'deactivate', 'healthCheck'])

export class PluginManifestError extends Error {}

export function validatePluginManifest(value: unknown): PluginManifestV1 & { nodeTypes: string[] } {
  if (!value || typeof value !== 'object') throw new PluginManifestError('manifest must be an object')
  const manifest = value as Record<string, unknown>
  if (manifest.manifestVersion !== 1) throw new PluginManifestError('unsupported manifest version')
  if (typeof manifest.id !== 'string' || !idPattern.test(manifest.id)) throw new PluginManifestError('invalid plugin id')
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) throw new PluginManifestError('invalid plugin name')
  if (typeof manifest.version !== 'string' || !semverPattern.test(manifest.version)) throw new PluginManifestError('invalid plugin version')
  if (manifest.compatibility !== `^${PLUGIN_API_VERSION}`) throw new PluginManifestError('incompatible plugin API version')
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.some((item) => !PLUGIN_CAPABILITIES.includes(item as never))) throw new PluginManifestError('invalid plugin capability')
  const schema = manifest.settingsSchema as Record<string, unknown> | undefined
  if (!schema || schema.type !== 'object') throw new PluginManifestError('invalid settings schema')
  if (!Array.isArray(manifest.nodes)) throw new PluginManifestError('invalid plugin nodes')
  const seen = new Set<string>()
  for (const raw of manifest.nodes) {
    const node = raw as Record<string, unknown>
    if (typeof node.type !== 'string' || !nodePattern.test(node.type)) throw new PluginManifestError('invalid node type')
    if (seen.has(node.type)) throw new PluginManifestError('duplicate node contribution')
    seen.add(node.type)
    if (typeof node.name !== 'string' || !node.inputSchema || !node.outputSchema) throw new PluginManifestError('invalid node definition')
  }
  if (!Array.isArray(manifest.lifecycle) || manifest.lifecycle.some((hook) => !hooks.has(hook as PluginLifecycleHook))) throw new PluginManifestError('invalid lifecycle hook')
  return Object.assign(manifest as unknown as PluginManifestV1, { nodeTypes: [...seen].map((type) => `plugin:${manifest.id}:${type}`) })
}

export function validatePluginSettings(manifest: PluginManifestV1, settings: unknown): Record<string, unknown> {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new PluginManifestError('settings must be an object')
  const result = settings as Record<string, unknown>
  const properties = manifest.settingsSchema.properties ?? {}
  if (manifest.settingsSchema.additionalProperties === false && Object.keys(result).some((key) => !(key in properties))) throw new PluginManifestError('unknown plugin setting')
  for (const key of manifest.settingsSchema.required ?? []) if (result[key] === undefined) throw new PluginManifestError(`missing plugin setting: ${key}`)
  for (const [key, property] of Object.entries(properties)) if (result[key] !== undefined && typeof result[key] !== property.type) throw new PluginManifestError(`invalid plugin setting: ${key}`)
  return result
}
