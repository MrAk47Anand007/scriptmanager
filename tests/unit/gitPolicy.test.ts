import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { classifyGitAction, resolveRepositoryPath } from '@/lib/git/policy'

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
})
