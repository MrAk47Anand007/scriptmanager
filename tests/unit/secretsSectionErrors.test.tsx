// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SecretsSection } from '@/components/settings/SecretsSection'
import { toast } from '@/components/ui/toast'

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('secret vault errors', () => {
  it('reports create failures and keeps the entered secret available for retry', async () => {
    const createSecret = vi.fn().mockRejectedValue(new Error('Secret could not be stored'))
    const listSecrets = vi.fn().mockResolvedValue([])
    const errorToast = vi.spyOn(toast, 'error')
    window.scriptManagerDesktop = { runtime: { createSecret, listSecrets } } as never

    render(<SecretsSection />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Deploy token' } })
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'secret-value' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Store encrypted' }))
      await Promise.resolve()
    })

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Secret could not be stored'))
    expect(screen.getByLabelText('Name')).toHaveValue('Deploy token')
    expect(screen.getByLabelText('Value')).toHaveValue('secret-value')
    expect(screen.getByRole('button', { name: 'Store encrypted' })).toBeEnabled()
  })
})
