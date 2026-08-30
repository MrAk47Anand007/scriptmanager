// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiSidebar } from '@/components/api/ApiSidebar'
import { toast } from '@/components/ui/toast'
import { makeStore } from '@/store/store'

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('API sidebar errors', () => {
  it('keeps collection creation open and reports persistence failures', async () => {
    const saveApiCollection = vi.fn().mockRejectedValue(new Error('Collection could not be saved'))
    const errorToast = vi.spyOn(toast, 'error')
    window.scriptManagerDesktop = { runtime: { saveApiCollection } } as never
    render(<Provider store={makeStore()}><ApiSidebar /></Provider>)

    fireEvent.click(screen.getByTitle('New collection'))
    const input = screen.getByPlaceholderText('Collection name')
    fireEvent.change(input, { target: { value: 'Deploy API' } })
    const createButton = input.parentElement?.querySelector('button')
    expect(createButton).not.toBeNull()

    await act(async () => {
      fireEvent.click(createButton!)
      await Promise.resolve()
    })

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Collection could not be saved'))
    expect(screen.getByPlaceholderText('Collection name')).toHaveValue('Deploy API')
    expect(saveApiCollection).toHaveBeenCalledOnce()
  })
})
