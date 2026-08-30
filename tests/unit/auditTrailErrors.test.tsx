// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuditTrailPanel } from '@/components/AuditTrailPanel'
import { makeStore } from '@/store/store'

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('audit trail errors', () => {
  it('reports audit log load failures instead of showing an empty history', async () => {
    const listAuditLog = vi.fn().mockRejectedValue(new Error('Audit service unavailable'))
    window.scriptManagerDesktop = { runtime: { listAuditLog } } as never

    render(<Provider store={makeStore()}><AuditTrailPanel /></Provider>)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Audit service unavailable'))
    expect(screen.queryByText('No executions recorded yet.')).not.toBeInTheDocument()
    expect(listAuditLog).toHaveBeenCalled()
  })
})
