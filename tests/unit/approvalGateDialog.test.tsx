// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovalGateDialog } from '@/components/ApprovalGateDialog'
import { toast } from '@/components/ui/toast'
import { makeStore } from '@/store/store'

const baseProps = {
  open: true,
  remoteExecId: 'remote-1',
  scriptName: 'deploy.sh',
  profileName: 'production',
  serverHost: 'server.example.com',
  environment: 'production' as const,
}

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('approval gate dialog', () => {
  it('does not approve or close when approval persistence fails', async () => {
    const approveRemoteExecution = vi.fn().mockRejectedValue(new Error('Approval could not be recorded'))
    const onApproved = vi.fn()
    const onClose = vi.fn()
    const errorToast = vi.spyOn(toast, 'error')
    window.scriptManagerDesktop = { runtime: { approveRemoteExecution } } as never
    render(<Provider store={makeStore()}><ApprovalGateDialog {...baseProps} onApproved={onApproved} onClose={onClose} /></Provider>)

    fireEvent.change(screen.getByPlaceholderText('e.g. Approved for hotfix deploy'), { target: { value: 'Approved emergency deploy' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve & Run on PRODUCTION' }))
      await Promise.resolve()
    })

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Approval could not be recorded'))
    expect(onApproved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(approveRemoteExecution).toHaveBeenCalledWith({ id: 'remote-1', note: 'Approved emergency deploy' })
  })

  it('does not close when rejection persistence fails', async () => {
    const rejectRemoteExecution = vi.fn().mockRejectedValue(new Error('Rejection could not be recorded'))
    const onClose = vi.fn()
    const errorToast = vi.spyOn(toast, 'error')
    window.scriptManagerDesktop = { runtime: { rejectRemoteExecution } } as never
    render(<Provider store={makeStore()}><ApprovalGateDialog {...baseProps} onApproved={vi.fn()} onClose={onClose} /></Provider>)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel / Reject' }))
      await Promise.resolve()
    })

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Rejection could not be recorded'))
    expect(onClose).not.toHaveBeenCalled()
    expect(rejectRemoteExecution).toHaveBeenCalledWith('remote-1')
  })
})
