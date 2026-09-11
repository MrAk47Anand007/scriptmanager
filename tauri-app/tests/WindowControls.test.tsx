// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { fireEvent as domFireEvent, screen, waitFor } from '@testing-library/dom'

const mounted = new Set<() => void>()
async function render(content: React.ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(content))
  const unmount = () => {
    act(() => root.unmount())
    container.remove()
    mounted.delete(unmount)
  }
  mounted.add(unmount)
  return { unmount }
}
const fireEvent = { click: (element: HTMLElement) => act(async () => { domFireEvent.click(element) }) }
function cleanup() { mounted.forEach((unmount) => unmount()) }
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WindowControls } from '../src/components/workbench/WindowControls'

const mocks = vi.hoisted(() => ({
  minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn(),
  isMaximized: vi.fn(), onResized: vi.fn(), error: vi.fn(),
}))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => mocks }))
vi.mock('@/components/ui/toast', () => ({ toast: { error: mocks.error } }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.isMaximized.mockResolvedValue(false)
  mocks.onResized.mockResolvedValue(vi.fn())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('provides all three accessible controls and forwards each click once', async () => {
  await render(<WindowControls />)
  await waitFor(() => expect(mocks.isMaximized).toHaveBeenCalled())
  await fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Maximize window' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Close window' }))
  await waitFor(() => {
    expect(mocks.minimize).toHaveBeenCalledTimes(1)
    expect(mocks.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })
})

it('switches between maximize and restore after button actions', async () => {
  await render(<WindowControls />)
  await waitFor(() => expect(mocks.isMaximized).toHaveBeenCalled())
  mocks.isMaximized.mockResolvedValue(true)
  await fireEvent.click(screen.getByRole('button', { name: 'Maximize window' }))
  await screen.findByRole('button', { name: 'Restore window' })
  mocks.isMaximized.mockResolvedValue(false)
  await fireEvent.click(screen.getByRole('button', { name: 'Restore window' }))
  await screen.findByRole('button', { name: 'Maximize window' })
  expect(mocks.toggleMaximize).toHaveBeenCalledTimes(2)
})

it('tracks native resize events and removes the listener on unmount', async () => {
  const unlisten = vi.fn()
  mocks.onResized.mockResolvedValue(unlisten)
  const view = await render(<WindowControls />)
  await waitFor(() => expect(mocks.isMaximized).toHaveBeenCalled())
  mocks.isMaximized.mockResolvedValue(true)
  await act(async () => mocks.onResized.mock.calls[0][0]())
  expect(screen.getByRole('button', { name: 'Restore window' })).toBeTruthy()
  view.unmount()
  expect(unlisten).toHaveBeenCalledTimes(1)
})

it('cleans up late listener registrations during StrictMode replay', async () => {
  const cleanups: ReturnType<typeof vi.fn>[] = []
  mocks.onResized.mockImplementation(async () => {
    const unlisten = vi.fn()
    cleanups.push(unlisten)
    return unlisten
  })
  const view = await render(<StrictMode><WindowControls /></StrictMode>)
  await waitFor(() => expect(cleanups).toHaveLength(2))
  expect(cleanups[0]).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(cleanups[1]).toHaveBeenCalledTimes(1)
})

it('reports a failed window action instead of rejecting silently', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.minimize.mockRejectedValue(new Error('permission denied'))
  await render(<WindowControls />)
  await fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }))
  await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1))
  log.mockRestore()
})
