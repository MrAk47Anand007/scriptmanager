import { describe, expect, it } from 'vitest'
import { getDesktopDroppedScriptPaths } from '@/lib/desktopFileDrop'

describe('desktop file drop', () => {
  it('keeps supported local script paths and ignores unsupported or missing paths', () => {
    expect(getDesktopDroppedScriptPaths([
      { path: '/workspace/deploy.py' },
      { path: '/workspace/tool.ts' },
      { path: '/workspace/run.sh' },
      { path: '/workspace/notes.txt' },
      { path: '' },
      {},
    ])).toEqual([
      '/workspace/deploy.py',
      '/workspace/tool.ts',
      '/workspace/run.sh',
    ])
  })

  it('deduplicates paths without changing their drop order', () => {
    expect(getDesktopDroppedScriptPaths([
      { path: '/workspace/deploy.py' },
      { path: '/workspace/deploy.py' },
      { path: '/workspace/Deploy.PY' },
    ])).toEqual(['/workspace/deploy.py', '/workspace/Deploy.PY'])
  })
})
