// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovalInbox } from '@/components/approvals/ApprovalInbox'

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('approval inbox preview rendering', () => {
  it('keeps rendering when an approval preview is not valid JSON', async () => {
    const listApprovals = vi.fn().mockResolvedValue([{
      id: 'approval-1',
      status: 'pending',
      actorId: 'user-1',
      operation: 'script.run',
      resource: 'deploy.sh',
      risk: 'high',
      reason: 'Deploy release',
      previewJson: 'legacy preview text',
      expiresAt: '2026-08-30T12:00:00.000Z',
      decisions: [],
    }])
    window.scriptManagerDesktop = { runtime: { listApprovals } } as never

    render(<ApprovalInbox />)

    await waitFor(() => expect(screen.getByText('legacy preview text')).toBeInTheDocument())
    expect(screen.getByText('script.run')).toBeInTheDocument()
  })
})
