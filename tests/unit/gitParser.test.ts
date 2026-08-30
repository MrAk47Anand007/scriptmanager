import { describe, expect, it } from 'vitest'
import { parseBranches, parseLog, parseStatus, parseUnifiedDiff } from '@/lib/git/parser'

describe('git output parsers', () => {
  it('parses porcelain status including conflicts and untracked files', () => {
    const result = parseStatus('## main...origin/main [ahead 1]\n M src/a.ts\nUU src/conflict.ts\n?? notes.txt\nM  staged.ts\n')
    expect(result.branch).toBe('main')
    expect(result.ahead).toBe(1)
    expect(result.files.map(file => [file.path, file.state])).toEqual([
      ['src/a.ts', 'modified'], ['src/conflict.ts', 'conflicted'], ['notes.txt', 'untracked'], ['staged.ts', 'modified'],
    ])
    expect(result.staged.map(f => f.path)).toEqual(['staged.ts'])
    expect(result.unstaged.map(f => f.path)).toEqual(['src/a.ts', 'src/conflict.ts', 'notes.txt'])
  })

  it('parses branches and unified diff sections', () => {
    expect(parseBranches('* main\n  feature/x\n  remotes/origin/main\n')).toEqual({ current: 'main', local: ['main', 'feature/x'], remote: ['origin/main'] })
    const files = parseUnifiedDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n')
    expect(files[0]).toMatchObject({ path: 'a.ts', additions: 1, deletions: 1 })
  })

  it('parses structured commit log output', () => {
    const logOutput = 'a1b2c3d|Alice|alice@example.com|2026-08-27|feat: add source control\ne4f5g6h|Bob|bob@example.com|2026-08-26|fix: workflow editor\n'
    const logs = parseLog(logOutput)
    expect(logs).toHaveLength(2)
    expect(logs[0]).toEqual({
      hash: 'a1b2c3d',
      author: 'Alice',
      email: 'alice@example.com',
      date: '2026-08-27',
      message: 'feat: add source control',
    })
  })
})
