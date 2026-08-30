// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginsSection } from '@/components/settings/PluginsSection'
import { WorkspaceAccessSection } from '@/components/settings/WorkspaceAccessSection'

const workspaceAccess = {
  workspace: { name: 'Community' },
  members: [{
    id: 'member-1',
    status: 'active',
    user: { id: 'user-1', name: 'Owner', email: 'owner@example.com' },
    role: { id: 'role-1', key: 'admin', name: 'Admin', permissions: [{ permission: '*:*' }] },
  }],
  roles: [{ id: 'role-1', key: 'admin', name: 'Admin', permissions: [{ permission: '*:*' }] }],
  invitations: [],
  permissions: ['*:*'],
  sessions: [],
  audit: [],
}

const plugin = {
  id: 'plugin-1',
  enabled: true,
  trusted: true,
  allowUnsigned: false,
  signatureValid: true,
  health: { status: 'healthy' },
  manifest: { id: 'community.plugin', name: 'Community Plugin', version: '1.0.0', capabilities: [] },
}

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('settings operation errors', () => {
  it('reports grant revocation failures without losing workspace access data', async () => {
    const revokeWorkspaceGrants = vi.fn().mockRejectedValue(new Error('Grant revocation failed'))
    window.scriptManagerDesktop = {
      runtime: {
        listWorkspaceAccess: vi.fn().mockResolvedValue(workspaceAccess),
        revokeWorkspaceGrants,
      },
    } as never

    render(<WorkspaceAccessSection />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revoke active approval and agent grants' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Revoke active approval and agent grants' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Grant revocation failed'))
    expect(screen.getByText(/for Community/)).toBeInTheDocument()
    expect(revokeWorkspaceGrants).toHaveBeenCalledOnce()
  })

  it('reports plugin uninstall failures and keeps the plugin available for retry', async () => {
    const removePlugin = vi.fn().mockRejectedValue(new Error('Plugin uninstall failed'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    window.scriptManagerDesktop = {
      runtime: {
        listPlugins: vi.fn().mockResolvedValue([plugin]),
        removePlugin,
      },
    } as never

    render(<PluginsSection />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Uninstall' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Plugin uninstall failed'))
    expect(screen.getByText('Community Plugin')).toBeInTheDocument()
    expect(removePlugin).toHaveBeenCalledWith('plugin-1')
  })
})
