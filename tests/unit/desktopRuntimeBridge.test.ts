// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadBootstrapRuntime } from '@/lib/bootstrapRuntimeClient'
import { listSecretsRuntime } from '@/lib/secretsRuntimeClient'
import { readSettingsRuntime } from '@/lib/settingsRuntimeClient'
import { listApprovalsRuntime } from '@/lib/approvalsRuntimeClient'
import { loadWorkspaceAccessRuntime } from '@/lib/workspacesRuntimeClient'
import { listWorkflowsRuntime } from '@/lib/workflowsRuntimeClient'

afterEach(() => {
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('desktop runtime bridge', () => {
  it('uses preload bootstrap instead of /api/bootstrap when desktop runtime exists', async () => {
    const getBootstrapState = vi.fn().mockResolvedValue({ scripts: [], collections: [], settings: {} })
    window.scriptManagerDesktop = { runtime: { getBootstrapState } } as never

    await expect(loadBootstrapRuntime()).resolves.toEqual({ scripts: [], collections: [], settings: {} })
    expect(getBootstrapState).toHaveBeenCalledOnce()
  })

  it('uses preload settings, secrets, approvals, workspace, and workflow APIs in desktop mode', async () => {
    const readSettings = vi.fn().mockResolvedValue({ theme: 'dark' })
    const listSecrets = vi.fn().mockResolvedValue([])
    const listApprovals = vi.fn().mockResolvedValue([])
    const listWorkspaceAccess = vi.fn().mockResolvedValue({ workspace: { name: 'Local' }, members: [], roles: [], invitations: [], permissions: [], sessions: [], audit: [] })
    const listWorkflows = vi.fn().mockResolvedValue([])

    window.scriptManagerDesktop = {
      runtime: {
        readSettings,
        listSecrets,
        listApprovals,
        listWorkspaceAccess,
        listWorkflows,
      },
    } as never

    await expect(readSettingsRuntime()).resolves.toEqual({ theme: 'dark' })
    await expect(listSecretsRuntime()).resolves.toEqual([])
    await expect(listApprovalsRuntime()).resolves.toEqual([])
    await expect(loadWorkspaceAccessRuntime()).resolves.toMatchObject({ workspace: { name: 'Local' } })
    await expect(listWorkflowsRuntime()).resolves.toEqual([])
  })
})
