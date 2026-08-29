// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAgentProfileRuntime,
  createAgentRunRuntime,
  listAgentProfilesRuntime,
  listAgentRunsRuntime,
  readAgentRunRuntime,
  updateAgentRunRuntime,
} from '@/lib/agentRuntimeClient'

afterEach(() => {
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('agent runtime bridge', () => {
  it('uses desktop persistence for profiles and runs', async () => {
    const listAgentProfiles = vi.fn().mockResolvedValue([{ id: 'profile-1', name: 'Local agent' }])
    const createAgentProfile = vi.fn().mockResolvedValue({ id: 'profile-1', name: 'Local agent' })
    const listAgentRuns = vi.fn().mockResolvedValue([{ id: 'run-1', status: 'running' }])
    const readAgentRun = vi.fn().mockResolvedValue({ id: 'run-1', messages: [] })
    const createAgentRun = vi.fn().mockResolvedValue({ id: 'run-1', provider: 'codex' })
    const updateAgentRun = vi.fn().mockResolvedValue({ id: 'run-1', status: 'interrupted' })
    window.scriptManagerDesktop = {
      runtime: { listAgentProfiles, createAgentProfile, listAgentRuns, readAgentRun, createAgentRun, updateAgentRun },
    } as never

    await expect(listAgentProfilesRuntime()).resolves.toHaveLength(1)
    await expect(createAgentProfileRuntime({ name: 'Local agent', provider: 'codex', accessLevel: 'observe', projectId: null })).resolves.toMatchObject({ id: 'profile-1' })
    await expect(listAgentRunsRuntime()).resolves.toHaveLength(1)
    await expect(readAgentRunRuntime('run-1')).resolves.toMatchObject({ id: 'run-1' })
    await expect(createAgentRunRuntime({ profileId: 'profile-1', prompt: 'Inspect', cwd: '/tmp' })).resolves.toMatchObject({ id: 'run-1' })
    await expect(updateAgentRunRuntime('run-1', 'interrupted')).resolves.toMatchObject({ status: 'interrupted' })
    expect(createAgentProfile).toHaveBeenCalledWith({ name: 'Local agent', provider: 'codex', accessLevel: 'observe', projectId: null })
    expect(createAgentRun).toHaveBeenCalledWith({ profileId: 'profile-1', prompt: 'Inspect', cwd: '/tmp' })
    expect(updateAgentRun).toHaveBeenCalledWith({ id: 'run-1', status: 'interrupted' })
  })
})
