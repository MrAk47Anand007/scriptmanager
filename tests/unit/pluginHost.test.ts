import { describe, expect, it, vi } from 'vitest'
import { createPluginHost } from '@/lib/plugins/host'

const manifest = { manifestVersion: 1, id: 'example.safe', name: 'Safe', version: '1.0.0', compatibility: '^1.0.0', capabilities: ['events:emit', 'vault:reference'], settingsSchema: { type: 'object' }, nodes: [], lifecycle: [] } as const
const context = { workspaceId: 'default', actorId: 'user', permissions: ['plugin:run'], correlationId: 'corr' }

describe('restricted plugin host', () => {
  it('allows declared capabilities without exposing raw secret resolution', async () => {
    const emit = vi.fn(async () => undefined)
    const host = createPluginHost(context, manifest, { emit })
    await host.emit('plugin.test', { ok: true })
    expect(emit).toHaveBeenCalledWith(context, 'plugin.test', { ok: true })
    expect(host.secretReference('secret://abc')).toBe('secret://abc')
    expect((host as unknown as Record<string, unknown>).resolveSecret).toBeUndefined()
  })

  it('denies undeclared capabilities and insufficient workspace permission', async () => {
    const host = createPluginHost(context, manifest, { http: vi.fn() })
    await expect(host.http({ url: 'https://example.com' })).rejects.toThrow('capability')
    expect(() => createPluginHost({ ...context, permissions: [] }, manifest, {})).toThrow('permission')
  })
})
