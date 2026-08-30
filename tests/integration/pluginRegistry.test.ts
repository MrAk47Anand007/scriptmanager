import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createPluginRegistry } from '@/lib/plugins/registry'

const manifest = { manifestVersion: 1, id: 'example.uppercase', name: 'Uppercase', version: '1.0.0', compatibility: '^1.0.0', capabilities: ['events:emit'], settingsSchema: { type: 'object', properties: { prefix: { type: 'string' } }, additionalProperties: false }, nodes: [{ type: 'uppercase', name: 'Uppercase', inputSchema: {}, outputSchema: {} }], lifecycle: ['healthCheck'] }

describe('plugin registry', () => {
  const registry = createPluginRegistry(prisma)
  beforeEach(async () => { await prisma.pluginInstallation.deleteMany(); await prisma.pluginPackage.deleteMany() })

  it('requires explicit unsigned opt-in and trust before enable', async () => {
    await expect(registry.install({ workspaceId: 'default', actorId: 'admin', manifest, source: 'local' })).rejects.toThrow('unsigned')
    const installed = await registry.install({ workspaceId: 'default', actorId: 'admin', manifest, source: 'local', allowUnsigned: true })
    expect(installed.enabled).toBe(false)
    await expect(registry.enable('default', installed.id)).rejects.toThrow('trusted')
    await registry.trust('default', installed.id)
    expect((await registry.enable('default', installed.id)).enabled).toBe(true)
  })

  it('validates settings and isolates workspaces', async () => {
    const installed = await registry.install({ workspaceId: 'default', actorId: 'admin', manifest, source: 'local', allowUnsigned: true })
    await expect(registry.updateSettings('other', installed.id, {})).rejects.toThrow('not found')
    await expect(registry.updateSettings('default', installed.id, { extra: true })).rejects.toThrow('unknown')
    expect((await registry.updateSettings('default', installed.id, { prefix: '>' })).settings).toEqual({ prefix: '>' })
    await registry.uninstall('default', installed.id)
    expect(await registry.list('default')).toEqual([])
  })

  it('checks plugin data integrity and reports corrupted settings without breaking the list', async () => {
    const installed = await registry.install({ workspaceId: 'default', actorId: 'admin', manifest, source: 'local', allowUnsigned: true })
    const healthy = await registry.checkHealth('default', installed.id)
    expect(healthy.health).toMatchObject({ status: 'healthy' })

    await prisma.pluginInstallation.update({ where: { id: installed.id }, data: { settingsJson: 'not-json' } })
    const unhealthy = await registry.checkHealth('default', installed.id)
    expect(unhealthy.health.status).toBe('unhealthy')
    expect(unhealthy.health.message).toContain('settings')
    expect(await registry.list('default')).toHaveLength(1)
  })
})
