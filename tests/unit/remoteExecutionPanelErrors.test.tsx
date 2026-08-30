// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteExecutionPanel } from '@/components/RemoteExecutionPanel'
import { toast } from '@/components/ui/toast'
import { fetchServerProfiles, setSelectedProfile, type ServerProfile } from '@/features/ops/opsSlice'
import { makeStore } from '@/store/store'

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Production host',
  host: 'server.example.com',
  port: 22,
  username: 'deploy',
  auth_method: 'key',
  has_secret: true,
  key_path: '/home/deploy/.ssh/id_ed25519',
  project_id: null,
  notes: '',
  created_at: '2026-08-30T00:00:00.000Z',
  updated_at: '2026-08-30T00:00:00.000Z',
}

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('remote execution panel errors', () => {
  it('reports connection test failures', async () => {
    const testServerProfileConnection = vi.fn().mockRejectedValue(new Error('SSH connection refused'))
    const errorToast = vi.spyOn(toast, 'error')
    window.scriptManagerDesktop = { runtime: { testServerProfileConnection } } as never
    const store = makeStore()
    store.dispatch(fetchServerProfiles.fulfilled([profile], 'test', undefined))
    store.dispatch(setSelectedProfile(profile.id))

    render(<Provider store={store}><RemoteExecutionPanel /></Provider>)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))
      await Promise.resolve()
    })

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('SSH connection refused'))
    expect(testServerProfileConnection).toHaveBeenCalledWith(profile.id)
  })
})
