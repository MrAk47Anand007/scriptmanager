import { describe, expect, it } from 'vitest'
import reducer, { selectGitProject, setGitResult } from '@/features/git/gitSlice'

describe('git slice', () => {
  it('selects a project and stores status results', () => {
    let state = reducer(undefined, selectGitProject('project-1'))
    state = reducer(state, setGitResult({ action: 'status', data: { branch: 'main', files: [], clean: true, ahead: 0, behind: 0, upstream: null } }))
    expect(state.projectId).toBe('project-1')
    expect(state.status?.branch).toBe('main')
  })
})
