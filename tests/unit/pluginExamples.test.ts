import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { validatePluginManifest } from '@/lib/plugins/manifest'
import { createPluginHost } from '@/lib/plugins/host'
import { manifest as nodeManifest, plugin as nodePlugin } from '../../examples/plugins/workflow-node/plugin'
import { manifest as notificationManifest } from '../../examples/plugins/notification/plugin'

describe('plugin SDK examples', () => {
  it('validates both manifests and executes the workflow node through the restricted host', async () => {
    expect(validatePluginManifest(nodeManifest).nodeTypes).toContain('plugin:example.uppercase:uppercase')
    expect(validatePluginManifest(notificationManifest).nodeTypes).toContain('plugin:example.notification:notify')
    const emit = vi.fn(async () => undefined)
    const host = createPluginHost({ workspaceId: 'default', actorId: 'user', permissions: ['plugin:run'], correlationId: 'c' }, nodeManifest, { emit })
    await expect(nodePlugin.executeNode('uppercase', { prefix: '>' }, { value: 'hello' }, host)).resolves.toEqual({ value: '>HELLO' })
  })

  it('keeps examples isolated from Prisma and Electron internals', async () => {
    for (const file of ['examples/plugins/workflow-node/plugin.ts', 'examples/plugins/notification/plugin.ts']) {
      const source = await readFile(file, 'utf8')
      expect(source).not.toMatch(/@prisma|electron|lib\/db|resolveSecret/)
    }
  })
})
