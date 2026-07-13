import { describe, expect, it } from 'vitest'
import { parseBranches, parseStatus, parseUnifiedDiff } from '@/lib/git/parser'

describe('git output parsers', () => {
  it('parses porcelain status including conflicts and untracked files', () => {
    const result = parseStatus('## main...origin/main [ahead 1]\n M src/a.ts\nUU src/conflict.ts\n?? notes.txt\n')
    expect(result.branch).toBe('main')
    expect(result.ahead).toBe(1)
    expect(result.files.map(file => [file.path, file.state])).toEqual([
      ['src/a.ts', 'modified'], ['src/conflict.ts', 'conflicted'], ['notes.txt', 'untracked'],
    ])
  })

  it('parses branches and unified diff sections', () => {
    expect(parseBranches('* main\n  feature/x\n  remotes/origin/main\n')).toEqual({ current: 'main', local: ['main', 'feature/x'], remote: ['origin/main'] })
    const files = parseUnifiedDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n')
    expect(files[0]).toMatchObject({ path: 'a.ts', additions: 1, deletions: 1 })
  })
})
