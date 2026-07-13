import { describe, expect, it } from 'vitest'
import { executeWorkflowNode } from '@/lib/workflows/nodeExecutors'
import { PluginRuntimeRegistry } from '@/lib/plugins/runtime'

describe('plugin workflow nodes', () => {
  it('executes enabled namespaced nodes and rejects disabled plugins', async () => {
    const registry = new PluginRuntimeRegistry()
    registry.register('default', 'example.uppercase', { executeNode: async (_type, config, input) => ({ value: `${config.prefix}${String((input as any).value).toUpperCase()}` }) }, true)
    const adapters = { runScript: async()=>null, runApiRequest: async()=>null, runRemoteCommand: async()=>null, sendNotification: async()=>null, runPluginNode: registry.workflowAdapter({ workspaceId: 'default', actorId: 'user', permissions: ['plugin:run'], correlationId: 'corr' }) }
    await expect(executeWorkflowNode({ id: 'p', type: 'plugin:example.uppercase:uppercase', name: 'Upper', config: { prefix: '>' } }, { value: 'hello' }, adapters)).resolves.toEqual({ status: 'succeeded', output: { value: '>HELLO' } })
    registry.setEnabled('default', 'example.uppercase', false)
    await expect(executeWorkflowNode({ id: 'p', type: 'plugin:example.uppercase:uppercase', name: 'Upper', config: {} }, {}, adapters)).rejects.toThrow('disabled')
  })
})
