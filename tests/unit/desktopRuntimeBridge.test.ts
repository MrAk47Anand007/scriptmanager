// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadBootstrapRuntime } from '@/lib/bootstrapRuntimeClient'
import { listSecretsRuntime } from '@/lib/secretsRuntimeClient'
import { readSettingsRuntime } from '@/lib/settingsRuntimeClient'
import { listApprovalsRuntime } from '@/lib/approvalsRuntimeClient'
import { loadWorkspaceAccessRuntime } from '@/lib/workspacesRuntimeClient'
import { listWorkflowsRuntime } from '@/lib/workflowsRuntimeClient'
import { clearGithubGistSettingsRuntime, readGithubGistSettingsRuntime, saveGithubGistSettingsRuntime } from '@/lib/gistCredentialsRuntimeClient'
import { deleteDesktopGist, syncDesktopScriptToGist } from '@/lib/scriptsRuntimeClient'

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

  it('keeps GitHub Gist credentials behind a dedicated desktop bridge', async () => {
    const readGithubGistSettings = vi.fn().mockResolvedValue({ configured: true, syncEnabled: false })
    const saveGithubGistSettings = vi.fn().mockResolvedValue({ configured: true, syncEnabled: true })
    const clearGithubGistSettings = vi.fn().mockResolvedValue({ configured: false, syncEnabled: false })
    window.scriptManagerDesktop = { runtime: { readGithubGistSettings, saveGithubGistSettings, clearGithubGistSettings } } as never

    await expect(readGithubGistSettingsRuntime()).resolves.toEqual({ configured: true, syncEnabled: false })
    await expect(saveGithubGistSettingsRuntime({ token: 'github-secret-token', syncEnabled: true })).resolves.toEqual({ configured: true, syncEnabled: true })
    await expect(clearGithubGistSettingsRuntime()).resolves.toEqual({ configured: false, syncEnabled: false })
    expect(saveGithubGistSettings).toHaveBeenCalledWith({ token: 'github-secret-token', syncEnabled: true })
  })

  it('uses desktop IPC for Gist sync and unlink operations', async () => {
    const syncGist = vi.fn().mockResolvedValue({ gist_id: 'gist-1', gist_url: 'https://gist.github.com/gist-1', gist_filename: 'script.py' })
    const deleteGist = vi.fn().mockResolvedValue({ ok: true })
    window.scriptManagerDesktop = { runtime: { syncGist, deleteGist } } as never

    await expect(syncDesktopScriptToGist('script-1')).resolves.toMatchObject({ gist_id: 'gist-1' })
    await expect(deleteDesktopGist('script-1')).resolves.toEqual({ ok: true })
    expect(syncGist).toHaveBeenCalledWith('script-1')
    expect(deleteGist).toHaveBeenCalledWith('script-1')
  })
})
