import { describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((name: string, value: unknown) => bridge.exposed.set(name, value)),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}))

await import('../../electron/preload')

describe('Electron preload bridge', () => {
  it('exposes only service-owned agent controls to the renderer', () => {
    const exposed = bridge.exposed.get('scriptManagerDesktop') as { agents: Record<string, unknown>; runtime: Record<string, unknown> }

    expect(Object.keys(exposed.agents).sort()).toEqual(['discover', 'interruptRun', 'onEvent', 'resumeRun', 'run', 'terminateRun'])
    expect(exposed.runtime).not.toHaveProperty('createAgentRun')
    expect(exposed.runtime).not.toHaveProperty('appendAgentMessage')
    expect(exposed.runtime).not.toHaveProperty('updateAgentRun')
  })
})
