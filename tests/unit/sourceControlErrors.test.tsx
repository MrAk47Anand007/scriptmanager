// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceControlWorkbench } from '@/components/git/SourceControlWorkbench'
import { toast } from '@/components/ui/toast'
import { fetchProjects, type Project } from '@/features/ops/opsSlice'
import { selectGitProject } from '@/features/git/gitSlice'
import { makeStore } from '@/store/store'

const project: Project = {
  id: 'project-1',
  name: 'Scripts',
  description: '',
  environment: 'development',
  color: '#2563eb',
  repository_root: null,
  default_branch: 'main',
  remote_url: null,
  workspace_policy: {
    allowCommit: true,
    allowPull: true,
    requireApprovalForPush: true,
    requireApprovalForForce: true,
    requireApprovalForCleanup: true,
  },
  collection_ids: [],
  created_at: '2026-08-30T00:00:00.000Z',
  updated_at: '2026-08-30T00:00:00.000Z',
}

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('source control errors', () => {
  it('reports repository connection failures and keeps the path for retry', async () => {
    const saveProject = vi.fn().mockRejectedValue(new Error('Repository could not be connected'))
    const errorToast = vi.spyOn(toast, 'error')
    window.scriptManagerDesktop = { runtime: { saveProject } } as never
    const store = makeStore()
    store.dispatch(fetchProjects.fulfilled([project], 'test', undefined))
    store.dispatch(selectGitProject(project.id))

    render(<Provider store={store}><SourceControlWorkbench /></Provider>)
    fireEvent.change(screen.getByLabelText('Repository root'), { target: { value: '/workspace/scripts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect repository' }))

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Repository could not be connected'))
    expect(screen.getByLabelText('Repository root')).toHaveValue('/workspace/scripts')
    expect(saveProject).toHaveBeenCalledWith(expect.objectContaining({ id: project.id, repository_root: '/workspace/scripts' }))
  })
})
