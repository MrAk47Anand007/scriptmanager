// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAgentProfileRuntime,
  interruptAgentRuntime,
  launchAgentRuntime,
  listAgentProfilesRuntime,
  listAgentRunsRuntime,
  readAgentRunRuntime,
  resumeAgentRuntime,
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
    const run = vi.fn().mockResolvedValue({ id: 'run-1', provider: 'codex' })
    const interruptRun = vi.fn().mockResolvedValue({ id: 'run-1', status: 'interrupted' })
    const resumeRun = vi.fn().mockResolvedValue({ id: 'run-1', status: 'running' })
    window.scriptManagerDesktop = {
      agents: { run, interruptRun, resumeRun, terminateRun: vi.fn(), onEvent: vi.fn() },
      runtime: { listAgentProfiles, createAgentProfile, listAgentRuns, readAgentRun },
    } as never

    await expect(listAgentProfilesRuntime()).resolves.toHaveLength(1)
    await expect(createAgentProfileRuntime({ name: 'Local agent', provider: 'codex', accessLevel: 'observe', projectId: null })).resolves.toMatchObject({ id: 'profile-1' })
    await expect(listAgentRunsRuntime()).resolves.toHaveLength(1)
    await expect(readAgentRunRuntime('run-1')).resolves.toMatchObject({ id: 'run-1' })
    await expect(launchAgentRuntime({ profileId: 'profile-1', prompt: 'Inspect', cwd: '/tmp' })).resolves.toMatchObject({ id: 'run-1' })
    await expect(interruptAgentRuntime('run-1')).resolves.toMatchObject({ status: 'interrupted' })
    await expect(resumeAgentRuntime('run-1', 'continue')).resolves.toMatchObject({ status: 'running' })
    expect(createAgentProfile).toHaveBeenCalledWith({ name: 'Local agent', provider: 'codex', accessLevel: 'observe', projectId: null })
    expect(run).toHaveBeenCalledWith({ profileId: 'profile-1', prompt: 'Inspect', cwd: '/tmp' })
    expect(interruptRun).toHaveBeenCalledWith('run-1')
    expect(resumeRun).toHaveBeenCalledWith({ runId: 'run-1', prompt: 'continue' })
  })
})
