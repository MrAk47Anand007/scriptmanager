// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VersionHistoryPanel } from '@/components/VersionHistoryPanel'
import { toast } from '@/components/ui/toast'
import { makeStore } from '@/store/store'

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('version history errors', () => {
  it('reports snapshot read failures without an unhandled rejection', async () => {
    const readVersion = vi.fn().mockRejectedValue(new Error('Version content unavailable'))
    const errorToast = vi.spyOn(toast, 'error')
    window.scriptManagerDesktop = {
      runtime: {
        listVersions: vi.fn().mockResolvedValue([{ id: 'version-1', snapshot_number: 1, saved_at: '2026-08-30T00:00:00.000Z' }]),
        readVersion,
      },
    } as never

    render(<Provider store={makeStore()}><VersionHistoryPanel scriptId="script-1" currentContent="current" language="python" onRestore={vi.fn()} /></Provider>)
    fireEvent.click(screen.getByRole('button', { name: /Version History/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Snapshot #1/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Snapshot #1/ }))

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Version content unavailable'))
    expect(readVersion).toHaveBeenCalledWith({ scriptId: 'script-1', versionId: 'version-1' })
  })
})
