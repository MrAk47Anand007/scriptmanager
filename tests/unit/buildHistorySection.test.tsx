// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BuildHistorySection } from '@/components/BuildHistorySection'

describe('build history section', () => {
  it('renders local desktop builds and opens their output', () => {
    const onBuildClick = vi.fn()

    render(<BuildHistorySection
      desktopRuntime
      builds={[{
        id: 'build-1',
        script_id: 'script-1',
        status: 'success',
        started_at: '2026-08-30T10:00:00.000Z',
        completed_at: '2026-08-30T10:00:01.000Z',
        triggered_by: 'scheduler',
      }]}
      onBuildClick={onBuildClick}
    />)

    expect(screen.getByText('Build History · Local')).toBeInTheDocument()
    fireEvent.click(screen.getByText('#1'))
    expect(onBuildClick).toHaveBeenCalledWith('build-1')
  })
})
