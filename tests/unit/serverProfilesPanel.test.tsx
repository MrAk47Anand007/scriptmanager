// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServerProfilesPanel } from '@/components/ServerProfilesPanel'
import { createServerProfile } from '@/features/ops/opsSlice'
import { makeStore } from '@/store/store'

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('server profiles panel', () => {
  it('keeps the add form open and reports persistence failures', async () => {
    const saveServerProfile = vi.fn().mockRejectedValue(new Error('Profile could not be saved'))
    window.scriptManagerDesktop = { runtime: { saveServerProfile } } as never
    render(<Provider store={makeStore()}><ServerProfilesPanel /></Provider>)

    fireEvent.click(screen.getByTitle('Add server profile'))
    fireEvent.change(screen.getByPlaceholderText('Prod-Server-01'), { target: { value: 'Deploy host' } })
    fireEvent.change(screen.getByPlaceholderText('192.168.1.100 or server.example.com'), { target: { value: 'example.com' } })
    fireEvent.change(screen.getByPlaceholderText('ubuntu'), { target: { value: 'ubuntu' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Profile' }))
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText(/could not be saved/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Add Profile' })).toBeInTheDocument()
    expect(saveServerProfile).toHaveBeenCalledOnce()
  })

  it('starts a fresh add form after editing an existing profile', () => {
    const store = makeStore()
    store.dispatch(createServerProfile.fulfilled({
      id: 'profile-1', name: 'Legacy host', host: 'legacy.example.com', port: 22, username: 'root',
      auth_method: 'password', has_secret: true, key_path: null, project_id: null, notes: '',
      created_at: '2026-08-30T00:00:00.000Z', updated_at: '2026-08-30T00:00:00.000Z',
    }, 'test', { name: 'Legacy host', host: 'legacy.example.com', username: 'root' }))
    render(<Provider store={store}><ServerProfilesPanel /></Provider>)

    fireEvent.click(screen.getByTitle('Edit'))
    expect(screen.getByPlaceholderText('Prod-Server-01')).toHaveValue('Legacy host')
    fireEvent.click(screen.getByTitle('Add server profile'))
    expect(screen.getByPlaceholderText('Prod-Server-01')).toHaveValue('')
  })
})
