// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadBootstrapRuntime } from '@/lib/bootstrapRuntimeClient'
import { listSecretsRuntime } from '@/lib/secretsRuntimeClient'
import { readSettingsRuntime } from '@/lib/settingsRuntimeClient'
import { listApprovalsRuntime } from '@/lib/approvalsRuntimeClient'
import { loadWorkspaceAccessRuntime } from '@/lib/workspacesRuntimeClient'
import { listWorkflowsRuntime } from '@/lib/workflowsRuntimeClient'
import { clearGithubGistSettingsRuntime, readGithubGistSettingsRuntime, saveGithubGistSettingsRuntime } from '@/lib/gistCredentialsRuntimeClient'
import { deleteDesktopGist, deleteDesktopTemplate, exportScriptRuntime, exportScriptsRuntime, importScriptsRuntime, readScriptContentRuntime, syncDesktopScriptToGist } from '@/lib/scriptsRuntimeClient'
import { runScript as runScriptThunk } from '@/features/scripts/scriptsSlice'
import { runGitActionRuntime } from '@/lib/gitRuntimeClient'
import {
  cancelObservabilityRunRuntime,
  getObservabilityDashboardRuntime,
  getObservabilityRunDetailRuntime,
  readObservabilityLogRuntime,
  retryObservabilityRunRuntime,
} from '@/lib/observabilityRuntimeClient'
import { listDesktopBuilds, readDesktopBuildOutput } from '@/lib/scriptsRuntimeClient'
import {
  listDesktopScriptEnv,
  listDesktopScriptVersions,
  readDesktopScriptSchedule,
  readDesktopScriptVersion,
  regenerateDesktopWebhook,
  regenerateDesktopWebhookSecret,
  saveDesktopScriptEnv,
  saveDesktopScriptSchedule,
  toggleDesktopWebhookSignature,
  addDesktopTag,
  listDesktopTags,
  removeDesktopTag,
  listDesktopTemplates,
  saveDesktopTemplate,
} from '@/lib/scriptsRuntimeClient'

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

  it('reads non-active script content through desktop IPC', async () => {
    const readScript = vi.fn().mockResolvedValue({ id: 'script-1', content: 'print(1)' })
    window.scriptManagerDesktop = { runtime: { readScript } } as never

    await expect(readScriptContentRuntime('script-1')).resolves.toBe('print(1)')
    expect(readScript).toHaveBeenCalledWith('script-1')
  })

  it('runs scheduled scripts through desktop IPC', async () => {
    const runScript = vi.fn().mockResolvedValue({ buildId: 'build-1', status: 'started' })
    window.scriptManagerDesktop = { runtime: { runScript } } as never

    const dispatch = vi.fn()
    const getState = vi.fn().mockReturnValue({})
    const result = await runScriptThunk({ id: 'script-1', paramValues: { ENV: 'test' } })(dispatch, getState, undefined)

    expect(result.payload).toEqual({ buildId: 'build-1', status: 'started' })
    expect(runScript).toHaveBeenCalledWith({ scriptId: 'script-1', paramValues: { ENV: 'test' }, buildId: undefined })
  })

  it('runs Git actions through desktop IPC', async () => {
    const runGitAction = vi.fn().mockResolvedValue({ kind: 'result', data: { output: '' } })
    window.scriptManagerDesktop = { runtime: { runGitAction } } as never

    await expect(runGitActionRuntime('project-1', { action: 'status' })).resolves.toEqual({
      kind: 'result',
      data: { output: '' },
    })
    expect(runGitAction).toHaveBeenCalledWith({ projectId: 'project-1', action: { action: 'status' } })
  })

  it('uses desktop IPC for observability reads and workflow actions', async () => {
    const getObservabilityDashboard = vi.fn().mockResolvedValue({ metrics: { active: 1 } })
    const getObservabilityRunDetail = vi.fn().mockResolvedValue({ id: 'run-1' })
    const cancelObservabilityRun = vi.fn().mockResolvedValue({ id: 'run-1', cancelRequestedAt: 'now' })
    const retryObservabilityRun = vi.fn().mockResolvedValue({ id: 'run-1' })
    const readObservabilityLog = vi.fn().mockResolvedValue('{"id":"run-1"}')
    window.scriptManagerDesktop = {
      runtime: {
        getObservabilityDashboard,
        getObservabilityRunDetail,
        cancelObservabilityRun,
        retryObservabilityRun,
        readObservabilityLog,
      },
    } as never

    await expect(getObservabilityDashboardRuntime({ kind: 'workflow', status: 'failed' })).resolves.toMatchObject({ metrics: { active: 1 } })
    await expect(getObservabilityRunDetailRuntime('workflow', 'run-1')).resolves.toEqual({ id: 'run-1' })
    await expect(cancelObservabilityRunRuntime('workflow', 'run-1')).resolves.toMatchObject({ id: 'run-1' })
    await expect(retryObservabilityRunRuntime('workflow', 'run-1')).resolves.toEqual({ id: 'run-1' })
    await expect(readObservabilityLogRuntime('workflow', 'run-1')).resolves.toBe('{"id":"run-1"}')
    expect(getObservabilityDashboard).toHaveBeenCalledWith({ kind: 'workflow', status: 'failed' })
    expect(getObservabilityRunDetail).toHaveBeenCalledWith({ kind: 'workflow', id: 'run-1' })
    expect(cancelObservabilityRun).toHaveBeenCalledWith('run-1')
    expect(retryObservabilityRun).toHaveBeenCalledWith({ id: 'run-1' })
    expect(readObservabilityLog).toHaveBeenCalledWith({ kind: 'workflow', id: 'run-1' })
  })

  it('uses desktop IPC for script backup and restore', async () => {
    const exportScripts = vi.fn().mockResolvedValue({ _export_version: 1, scripts: [] })
    const importScripts = vi.fn().mockResolvedValue({ message: 'Imported 1 script(s), skipped 0 duplicate(s)' })
    window.scriptManagerDesktop = { runtime: { exportScripts, importScripts } } as never

    await expect(exportScriptsRuntime()).resolves.toMatchObject({ _export_version: 1 })
    await expect(importScriptsRuntime({ _export_version: 1, scripts: [] })).resolves.toMatchObject({ message: expect.stringContaining('Imported') })
    expect(exportScripts).toHaveBeenCalledOnce()
    expect(importScripts).toHaveBeenCalledWith({ _export_version: 1, scripts: [] })
  })

  it('uses desktop IPC for single-script export', async () => {
    const exportScript = vi.fn().mockResolvedValue({ _export_version: 1, name: 'Deploy', content: 'print(1)' })
    window.scriptManagerDesktop = { runtime: { exportScript } } as never

    await expect(exportScriptRuntime('script-1')).resolves.toMatchObject({ name: 'Deploy', content: 'print(1)' })
    expect(exportScript).toHaveBeenCalledWith('script-1')
  })

  it('uses desktop IPC for build history and build output', async () => {
    const listBuilds = vi.fn().mockResolvedValue([{ id: 'build-1', script_id: 'script-1', status: 'cancelled' }])
    const readBuildOutput = vi.fn().mockResolvedValue('cancelled output')
    window.scriptManagerDesktop = { runtime: { listBuilds, readBuildOutput } } as never

    await expect(listDesktopBuilds('script-1')).resolves.toHaveLength(1)
    await expect(readDesktopBuildOutput('script-1', 'build-1')).resolves.toBe('cancelled output')
    expect(listBuilds).toHaveBeenCalledWith('script-1')
    expect(readBuildOutput).toHaveBeenCalledWith({ scriptId: 'script-1', buildId: 'build-1' })
  })

  it('uses desktop IPC for script metadata and webhook controls', async () => {
    const readSchedule = vi.fn().mockResolvedValue({ schedule_cron: '* * * * *', schedule_enabled: true, next_run_time: null })
    const saveSchedule = vi.fn().mockResolvedValue({ schedule_cron: null, schedule_enabled: false, next_run_time: null })
    const listEnv = vi.fn().mockResolvedValue([])
    const saveEnv = vi.fn().mockResolvedValue({ id: 'env-1', key: 'TOKEN', value: '', is_secret: true })
    const listVersions = vi.fn().mockResolvedValue([])
    const readVersion = vi.fn().mockResolvedValue({ id: 'version-1', content: 'print(1)' })
    const regenerateWebhook = vi.fn().mockResolvedValue({ webhook_token: 'token-1' })
    const regenerateWebhookSecret = vi.fn().mockResolvedValue({ webhook_secret: 'secret-1' })
    const toggleWebhookSignature = vi.fn().mockResolvedValue({ require_webhook_signature: true, webhook_secret: 'secret-2' })
    window.scriptManagerDesktop = { runtime: { readSchedule, saveSchedule, listEnv, saveEnv, listVersions, readVersion, regenerateWebhook, regenerateWebhookSecret, toggleWebhookSignature } } as never

    await expect(readDesktopScriptSchedule('script-1')).resolves.toMatchObject({ schedule_enabled: true })
    await expect(saveDesktopScriptSchedule({ scriptId: 'script-1', cron: '', enabled: false })).resolves.toMatchObject({ schedule_enabled: false })
    await expect(listDesktopScriptEnv('script-1')).resolves.toEqual([])
    await expect(saveDesktopScriptEnv({ scriptId: 'script-1', key: 'token', value: 'value-1', isSecret: true })).resolves.toMatchObject({ is_secret: true })
    await expect(listDesktopScriptVersions('script-1')).resolves.toEqual([])
    await expect(readDesktopScriptVersion('script-1', 'version-1')).resolves.toMatchObject({ id: 'version-1' })
    await expect(regenerateDesktopWebhook('script-1')).resolves.toEqual({ webhook_token: 'token-1' })
    await expect(regenerateDesktopWebhookSecret('script-1')).resolves.toEqual({ webhook_secret: 'secret-1' })
    await expect(toggleDesktopWebhookSignature('script-1', true)).resolves.toMatchObject({ require_webhook_signature: true })
    expect(saveSchedule).toHaveBeenCalledWith({ scriptId: 'script-1', cron: '', enabled: false })
    expect(saveEnv).toHaveBeenCalledWith({ scriptId: 'script-1', key: 'token', value: 'value-1', isSecret: true })
  })

  it('uses desktop IPC to delete a custom template', async () => {
    const deleteTemplate = vi.fn().mockResolvedValue({ id: 'template-1' })
    window.scriptManagerDesktop = { runtime: { deleteTemplate } } as never

    await expect(deleteDesktopTemplate('template-1')).resolves.toEqual({ id: 'template-1' })
    expect(deleteTemplate).toHaveBeenCalledWith('template-1')
  })

  it('uses desktop IPC for tags', async () => {
    const listTags = vi.fn().mockResolvedValue([])
    const addTag = vi.fn().mockResolvedValue({ id: 'tag-1', name: 'release', color: '#123456' })
    const removeTag = vi.fn().mockResolvedValue(null)
    window.scriptManagerDesktop = { runtime: { listTags, addTag, removeTag } } as never

    await expect(listDesktopTags()).resolves.toEqual([])
    await expect(addDesktopTag({ scriptId: 'script-1', name: 'release' })).resolves.toMatchObject({ id: 'tag-1' })
    await expect(removeDesktopTag({ scriptId: 'script-1', tagId: 'tag-1' })).resolves.toBeNull()
    expect(addTag).toHaveBeenCalledWith({ scriptId: 'script-1', name: 'release' })
    expect(removeTag).toHaveBeenCalledWith({ scriptId: 'script-1', tagId: 'tag-1' })
  })

  it('uses desktop IPC for templates', async () => {
    const listTemplates = vi.fn().mockResolvedValue([])
    const saveTemplate = vi.fn().mockResolvedValue({ id: 'template-1', name: 'Release', is_built_in: false })
    window.scriptManagerDesktop = { runtime: { listTemplates, saveTemplate } } as never

    await expect(listDesktopTemplates()).resolves.toEqual([])
    await expect(saveDesktopTemplate({ name: 'Release', description: '', category: 'general', language: 'python', content: 'print(1)' })).resolves.toMatchObject({ id: 'template-1' })
    expect(saveTemplate).toHaveBeenCalledWith({ name: 'Release', description: '', category: 'general', language: 'python', content: 'print(1)' })
  })
})
