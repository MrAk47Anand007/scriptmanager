import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeDesktopScriptImportPayload } from '../../electron/desktopScriptImportValidation'

describe('desktop script import validation', () => {
  it('normalizes valid absolute script paths and preserves the selected mode', () => {
    const workspace = path.resolve('/workspace')
    const rawPath = path.join(workspace, 'tools', '..', 'deploy.py')
    const normalizedPath = path.normalize(rawPath)
    expect(normalizeDesktopScriptImportPayload({
      files: [{ path: rawPath }],
      mode: 'by-folder',
      rootForGrouping: workspace,
    })).toEqual({
      files: [{ path: normalizedPath }],
      mode: 'by-folder',
      rootForGrouping: workspace,
    })
  })

  it('rejects relative paths, unsupported modes, and oversized batches', () => {
    const workspace = path.resolve('/workspace')
    const absFile = path.join(workspace, 'deploy.py')
    expect(() => normalizeDesktopScriptImportPayload({ files: [{ path: 'deploy.py' }], mode: 'misc' })).toThrow('absolute')
    expect(() => normalizeDesktopScriptImportPayload({ files: [{ path: absFile }], mode: 'all' })).toThrow('mode')
    expect(() => normalizeDesktopScriptImportPayload({
      files: Array.from({ length: 2001 }, (_, index) => ({ path: path.join(workspace, `${index}.py`) })),
      mode: 'misc',
    })).toThrow('Too many')
  })
})
