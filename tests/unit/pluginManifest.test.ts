import { describe, expect, it } from 'vitest'
import { validatePluginManifest } from '@/lib/plugins/manifest'

const manifest = {
  manifestVersion: 1,
  id: 'example.uppercase',
  name: 'Uppercase',
  version: '1.0.0',
  compatibility: '^1.0.0',
  capabilities: ['events:emit'],
  settingsSchema: { type: 'object', properties: { prefix: { type: 'string' } }, additionalProperties: false },
  nodes: [{ type: 'uppercase', name: 'Uppercase', inputSchema: { type: 'object' }, outputSchema: { type: 'object' } }],
  lifecycle: ['activate', 'deactivate'],
} as const

describe('plugin manifest', () => {
  it('accepts a compatible, namespaced manifest', () => {
    expect(validatePluginManifest(manifest).nodeTypes).toEqual(['plugin:example.uppercase:uppercase'])
  })

  it.each([
    [{ ...manifest, compatibility: '^2.0.0' }, 'incompatible'],
    [{ ...manifest, id: '../unsafe' }, 'id'],
    [{ ...manifest, nodes: [manifest.nodes[0], manifest.nodes[0]] }, 'duplicate'],
    [{ ...manifest, settingsSchema: { type: 'array' } }, 'settings'],
    [{ ...manifest, lifecycle: ['install'] }, 'lifecycle'],
  ])('rejects invalid manifests', (value, message) => {
    expect(() => validatePluginManifest(value)).toThrow(message)
  })
})
