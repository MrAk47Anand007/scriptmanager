// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExecutionDashboard } from '@/components/observability/ExecutionDashboard'

const mocks = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getDetail: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
  readLog: vi.fn(),
}))

vi.mock('@/lib/observabilityRuntimeClient', () => ({
  getObservabilityDashboardRuntime: mocks.getDashboard,
  getObservabilityRunDetailRuntime: mocks.getDetail,
  cancelObservabilityRunRuntime: mocks.cancel,
  retryObservabilityRunRuntime: mocks.retry,
  readObservabilityLogRuntime: mocks.readLog,
}))

const dashboard = {
  metrics: { active: 1, succeeded: 0, failed: 0, timedOut: 0, retried: 0, averageDurationMs: 0 },
  activeRuns: [],
  recentRuns: [{ id: 'run-1', kind: 'workflow', name: 'Deploy', status: 'running', trigger: 'manual', retryCount: 0 }],
  failureTrend: [],
  scheduleHealth: { healthy: 1, disabled: 0, failing: 0 },
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.getDashboard.mockResolvedValue(dashboard)
  mocks.getDetail.mockResolvedValue({ id: 'run-1', status: 'running', nodeRuns: [], events: [] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('execution dashboard', () => {
  it('refreshes the dashboard and active run detail without manual interaction', async () => {
    render(<ExecutionDashboard />)
    await act(async () => { await Promise.resolve() })
    expect(mocks.getDashboard).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Deploy/ }))
    await act(async () => { await Promise.resolve() })
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(5_000)
      await Promise.resolve()
    })

    expect(mocks.getDashboard).toHaveBeenCalledTimes(2)
    expect(mocks.getDetail).toHaveBeenCalledTimes(2)
  })
})
