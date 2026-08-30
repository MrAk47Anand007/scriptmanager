import { describe, expect, it, vi } from 'vitest'

const nativeModuleLoads = vi.hoisted(() => ({ count: 0 }))

vi.mock('node-pty', () => {
  nativeModuleLoads.count += 1
  return { spawn: vi.fn() }
})

describe('socket service native terminal loading', () => {
  it('does not load the native PTY module while importing the service', async () => {
    await import('@/lib/socketService')

    expect(nativeModuleLoads.count).toBe(0)
  })
})
