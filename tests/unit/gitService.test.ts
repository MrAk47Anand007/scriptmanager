import { describe, expect, it, vi } from 'vitest'
import { createGitService } from '@/lib/git/service'
import { DEFAULT_WORKSPACE_POLICY } from '@/lib/git/types'

const workspace = { projectId: 'p1', name: 'Repo', root: 'C:/repo', defaultBranch: 'main', policy: DEFAULT_WORKSPACE_POLICY }

describe('git service', () => {
  it('uses exact argument arrays and audits status', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: '## main\n M a.ts\n', stderr: '', exitCode: 0 })
    const audit = vi.fn()
    const service = createGitService({ run, audit })
    const result = await service.execute(workspace, { action: 'status' }, { type: 'user', id: 'admin' })
    expect(run).toHaveBeenCalledWith(workspace.root, ['status', '--short', '--branch'])
    expect(result.kind).toBe('result')
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'status', outcome: 'succeeded' }))
  })

  it('handles add, reset, restore, branch_create, and log actions', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: 'a1b2c3d|Dev|dev@example.com|2026-08-27|test commit\n', stderr: '', exitCode: 0 })
    const audit = vi.fn()
    const service = createGitService({ run, audit })

    await service.execute(workspace, { action: 'add', path: 'src/file.ts' }, { type: 'user', id: 'admin' })
    expect(run).toHaveBeenCalledWith(workspace.root, ['add', 'src/file.ts'])

    await service.execute(workspace, { action: 'reset', path: 'src/file.ts' }, { type: 'user', id: 'admin' })
    expect(run).toHaveBeenCalledWith(workspace.root, ['reset', 'HEAD', '--', 'src/file.ts'])

    await service.execute(workspace, { action: 'restore', path: 'src/file.ts' }, { type: 'user', id: 'admin' })
    expect(run).toHaveBeenCalledWith(workspace.root, ['checkout', '--', 'src/file.ts'])

    await service.execute(workspace, { action: 'branch_create', branch: 'feat/new' }, { type: 'user', id: 'admin' })
    expect(run).toHaveBeenCalledWith(workspace.root, ['checkout', '-b', 'feat/new'])

    const logResult = await service.execute(workspace, { action: 'log' }, { type: 'user', id: 'admin' })
    expect(run).toHaveBeenCalledWith(workspace.root, ['log', '-n', '50', '--pretty=format:%H|%an|%ae|%ad|%s', '--date=short'])
    expect(logResult).toEqual({
      kind: 'result',
      data: [{ hash: 'a1b2c3d', author: 'Dev', email: 'dev@example.com', date: '2026-08-27', message: 'test commit' }],
    })
  })

  it('pauses push before spawning git', async () => {
    const run = vi.fn(), requestApproval = vi.fn().mockResolvedValue({ id: 'approval-1' })
    const service = createGitService({ run, audit: vi.fn(), requestApproval })
    const result = await service.execute(workspace, { action: 'push' }, { type: 'agent', id: 'agent-1' })
    expect(result).toEqual({ kind: 'approval', approval: { id: 'approval-1' } })
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects malformed actions before evaluating policy or spawning git', async () => {
    const run = vi.fn()
    const service = createGitService({ run, audit: vi.fn() })
    await expect(service.execute(workspace, { action: 'push', branch: '--delete' } as never, { type: 'user', id: 'admin' })).rejects.toThrow('branch')
    expect(run).not.toHaveBeenCalled()
  })
})
