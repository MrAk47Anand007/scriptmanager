// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestEditor } from '@/components/api/ApiRequestEditor'
import { toast } from '@/components/ui/toast'
import { fetchApiRequests, setActiveRequest, type ApiRequest } from '@/features/api/apiSlice'
import { makeStore } from '@/store/store'

const request: ApiRequest = {
  id: 'request-1',
  name: 'Health check',
  method: 'GET',
  url: 'https://api.example.com/health',
  headers: '[]',
  query_params: '[]',
  variables: '[]',
  request_options: '{}',
  pre_request_script: '',
  test_script: '',
  response_mappings: '[]',
  body_type: 'none',
  body: '',
  auth_type: 'none',
  auth_config: '{}',
  collection_id: null,
  created_at: '2026-08-30T00:00:00.000Z',
  updated_at: '2026-08-30T00:00:00.000Z',
}

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('API request editor errors', () => {
  it('reports request save failures without replacing the draft', async () => {
    const saveApiRequest = vi.fn().mockRejectedValue(new Error('Request could not be saved'))
    const errorToast = vi.spyOn(toast, 'error')
    window.scriptManagerDesktop = { runtime: { saveApiRequest } } as never
    const store = makeStore()
    store.dispatch(fetchApiRequests.fulfilled([request], 'test', undefined))
    store.dispatch(setActiveRequest(request.id))

    render(<Provider store={store}><ApiRequestEditor /></Provider>)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await Promise.resolve()
    })

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Request could not be saved'))
    expect(saveApiRequest).toHaveBeenCalledOnce()
    expect(screen.getByText('Health check')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})
