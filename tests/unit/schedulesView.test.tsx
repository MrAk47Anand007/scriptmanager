// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SchedulesView } from '@/components/SchedulesView'
import { toast } from '@/components/ui/toast'
import { fetchScripts } from '@/features/scripts/scriptsSlice'
import { makeStore } from '@/store/store'

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('schedules view', () => {
  it('reports a failed desktop schedule update', async () => {
    const saveSchedule = vi.fn().mockRejectedValue(new Error('Schedule could not be saved'))
    const errorToast = vi.spyOn(toast, 'error')
    window.scriptManagerDesktop = { runtime: { saveSchedule } } as never
    const store = makeStore()
    store.dispatch(fetchScripts.fulfilled([{
      id: 'script-1', name: 'Nightly', filename: 'nightly.py', language: 'python',
      schedule_cron: '* * * * *', schedule_enabled: true, created_at: '2026-08-30T00:00:00.000Z', updated_at: '2026-08-30T00:00:00.000Z',
    }], 'test', undefined))
    render(<Provider store={store}><SchedulesView /></Provider>)

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Toggle schedule for Nightly' }))
      await Promise.resolve()
    })

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Schedule could not be saved'))
    expect(saveSchedule).toHaveBeenCalledWith({ scriptId: 'script-1', cron: '* * * * *', enabled: false })
  })
})
