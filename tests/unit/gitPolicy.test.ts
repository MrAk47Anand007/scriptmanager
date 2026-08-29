import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { classifyGitAction, parseGitAction, parseWorkspacePolicy, resolveRepositoryPath } from '@/lib/git/policy'

describe('git workspace policy', () => {
  const root = path.resolve('C:/workspace/repo')

  it('keeps requested paths inside the repository root', () => {
    expect(resolveRepositoryPath(root, 'src/index.ts')).toBe(path.join(root, 'src/index.ts'))
    expect(() => resolveRepositoryPath(root, '../outside.txt')).toThrow('outside')
    expect(() => resolveRepositoryPath(root, 'C:/other/repo')).toThrow('outside')
    expect(() => resolveRepositoryPath(root, 'C:\\Windows\\System32')).toThrow('outside')
    expect(() => resolveRepositoryPath(root, '\\\\server\\share')).toThrow('outside')
  })

  it('marks remote, force, cleanup, and external writes as protected', () => {
    expect(classifyGitAction({ action: 'status' }).protected).toBe(false)
    expect(classifyGitAction({ action: 'commit' }).protected).toBe(false)
    expect(classifyGitAction({ action: 'push' }).protected).toBe(true)
    expect(classifyGitAction({ action: 'checkout', force: true }).protected).toBe(true)
    expect(classifyGitAction({ action: 'clean' }).protected).toBe(true)
  })

  it('accepts only well-formed Git action inputs', () => {
    expect(parseGitAction({ action: 'checkout', branch: 'feature/ui', force: true })).toEqual({ action: 'checkout', branch: 'feature/ui', force: true })
    expect(parseGitAction({ action: 'diff', path: 'src/app.ts' })).toEqual({ action: 'diff', path: 'src/app.ts' })
    expect(() => parseGitAction({ action: 'not-a-git-action' })).toThrow('Git action')
    expect(() => parseGitAction({ action: 'push', branch: '--delete' })).toThrow('branch')
    expect(() => parseGitAction({ action: 'fetch', remote: '--upload-pack=evil' })).toThrow('remote')
    expect(() => parseGitAction({ action: 'checkout' })).toThrow('branch')
    expect(() => parseGitAction({ action: 'commit', message: '' })).toThrow('message')
    expect(() => parseGitAction({ action: 'status', force: 'true' })).toThrow('force')
  })

  it('ignores malformed workspace policy values instead of treating them as enabled', () => {
    expect(parseWorkspacePolicy(JSON.stringify({ allowCommit: 'false', requireApprovalForPush: 0 }))).toEqual({
      allowCommit: true,
      allowPull: true,
      requireApprovalForPush: true,
      requireApprovalForForce: true,
      requireApprovalForCleanup: true,
    })
    expect(parseWorkspacePolicy(JSON.stringify({ allowCommit: false, requireApprovalForPush: false }))).toEqual({
      allowCommit: false,
      allowPull: true,
      requireApprovalForPush: false,
      requireApprovalForForce: true,
      requireApprovalForCleanup: true,
    })
  })
})
