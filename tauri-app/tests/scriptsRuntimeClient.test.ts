import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  runScriptInDesktopTerminal,
  subscribeToCanonicalFolderChanges,
  subscribeToDesktopBuildEvents,
  subscribeToDesktopTerminal,
} from '../src/lib/scriptsRuntimeClient'

const subscriptions = [
  { name: 'terminal', method: 'onTerminalEvent', subscribe: subscribeToDesktopTerminal },
  { name: 'build', method: 'onBuildEvent', subscribe: subscribeToDesktopBuildEvents },
  { name: 'canonical folder', method: 'onCanonicalFolderChange', subscribe: subscribeToCanonicalFolderChanges },
] as const

afterEach(() => vi.unstubAllGlobals())

describe.each(subscriptions)('$name event subscriptions', ({ method, subscribe }) => {
  function installRuntime() {
    const listeners = new Set<(event: unknown) => void>()
    const onEvent = vi.fn((listener: (event: unknown) => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    })
    vi.stubGlobal('window', { scriptManagerDesktop: { runtime: { [method]: onEvent } } })
    return listeners
  }

  it('delivers one event once after effect cleanup and repeated setup', () => {
    const listeners = installRuntime()
    const listener = vi.fn()
    let cleanup = subscribe((event) => listener(event))

    // React StrictMode and changing effect dependencies both replay this lifecycle.
    for (let render = 0; render < 10; render += 1) {
      cleanup()
      cleanup = subscribe((event) => listener(event))
    }

    expect(listeners.size).toBe(1)
    const event = { type: 'data', sessionId: 'terminal-1', data: 'Hello World\r\n' }
    listeners.forEach((receive) => receive(event))
    expect(listener).toHaveBeenCalledExactlyOnceWith(event)
    cleanup()
    expect(listeners.size).toBe(0)
  })

  it('does not deliver events to a closed panel after reopening', () => {
    const listeners = installRuntime()
    const oldListener = vi.fn()
    const cleanup = subscribe(oldListener)
    cleanup()
    const newListener = vi.fn()
    const newCleanup = subscribe(newListener)

    listeners.forEach((receive) => receive({ type: 'closed', sessionId: 'terminal-1' }))
    expect(oldListener).not.toHaveBeenCalled()
    expect(newListener).toHaveBeenCalledTimes(1)
    newCleanup()
    expect(listeners.size).toBe(0)
  })

  it('preserves independent subscribers when one unsubscribes', () => {
    const listeners = installRuntime()
    const first = vi.fn()
    const second = vi.fn()
    const cleanupFirst = subscribe(first)
    const cleanupSecond = subscribe(second)
    cleanupFirst()
    listeners.forEach((receive) => receive({}))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    cleanupSecond()
    expect(listeners.size).toBe(0)
  })

  it('returns a safe cleanup when the desktop runtime is unavailable', () => {
    vi.stubGlobal('window', {})
    expect(subscribe(vi.fn())).toBeTypeOf('function')
    expect(() => subscribe(vi.fn())()).not.toThrow()
  })
})

it('forwards one script run as exactly one desktop execution request', async () => {
  const runScriptInTerminal = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('window', { scriptManagerDesktop: { runtime: { runScriptInTerminal } } })
  await expect(runScriptInDesktopTerminal('smoke-script', { greeting: 'hello' })).resolves.toBe(true)
  expect(runScriptInTerminal).toHaveBeenCalledExactlyOnceWith({
    scriptId: 'smoke-script', sessionId: 'terminal-1', paramValues: { greeting: 'hello' },
  })
})
