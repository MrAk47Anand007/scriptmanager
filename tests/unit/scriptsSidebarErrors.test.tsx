// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScriptsSidebar } from '@/components/ScriptsSidebar'
import { toast } from '@/components/ui/toast'
import { makeStore } from '@/store/store'

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('scripts sidebar errors', () => {
  it('keeps collection creation open and reports persistence failures', async () => {
    const createCollection = vi.fn().mockRejectedValue(new Error('Collection could not be saved'))
    const errorToast = vi.spyOn(toast, 'error')
    window.scriptManagerDesktop = { runtime: { createCollection } } as never
    render(<Provider store={makeStore()}><ScriptsSidebar /></Provider>)

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Create script, collection, or project' }))
    fireEvent.click(screen.getByText('New Collection'))
    fireEvent.change(screen.getByPlaceholderText('Collection Name'), { target: { value: 'Deploy scripts' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))
      await Promise.resolve()
    })

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Collection could not be saved'))
    expect(screen.getByPlaceholderText('Collection Name')).toHaveValue('Deploy scripts')
    expect(createCollection).toHaveBeenCalledOnce()
  })
})
