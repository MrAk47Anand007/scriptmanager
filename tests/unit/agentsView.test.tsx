// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentsView } from '@/components/agents/AgentsView'

const mocks = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  listRuns: vi.fn(),
  readRun: vi.fn(),
  discover: vi.fn(),
  launch: vi.fn(),
  interrupt: vi.fn(),
  resume: vi.fn(),
  createProfile: vi.fn(),
  listProjects: vi.fn(),
}))

vi.mock('@/lib/agentRuntimeClient', () => ({
  createAgentProfileRuntime: mocks.createProfile,
  launchAgentRuntime: mocks.launch,
  interruptAgentRuntime: mocks.interrupt,
  resumeAgentRuntime: mocks.resume,
  listAgentProfilesRuntime: mocks.listProfiles,
  listAgentRunsRuntime: mocks.listRuns,
  readAgentRunRuntime: mocks.readRun,
  discoverAgentProvidersRuntime: mocks.discover,
}))

vi.mock('@/lib/opsRuntimeClient', () => ({
  listProjectsRuntime: mocks.listProjects,
}))

beforeEach(() => {
  window.__ELECTRON__ = true
  window.scriptManagerDesktop = {
    agents: {
      run: vi.fn(),
      interruptRun: vi.fn(),
      resumeRun: vi.fn(),
      terminateRun: vi.fn(),
      onEvent: vi.fn(() => () => undefined),
    },
  } as never
  mocks.listProfiles.mockResolvedValue([{ id: 'profile-1', name: 'Local Agent', provider: 'codex', accessLevel: 'observe' }])
  mocks.listRuns.mockResolvedValue([])
  mocks.listProjects.mockResolvedValue([])
  mocks.readRun.mockResolvedValue({ id: 'run-1', messages: [], artifacts: [] })
  mocks.discover.mockResolvedValue([])
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('raw fetch should not be used by the desktop workbench'))))
})

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  delete window.__ELECTRON__
  vi.restoreAllMocks()
})

describe('AgentsView', () => {
  it('loads desktop profiles and projects through runtime clients', async () => {
    render(<AgentsView />)

    await waitFor(() => expect(mocks.listProfiles).toHaveBeenCalledTimes(1))
    expect(mocks.listRuns).toHaveBeenCalledTimes(1)
    expect(mocks.listProjects).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Local Agent')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})
