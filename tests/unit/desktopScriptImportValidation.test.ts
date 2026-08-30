import { describe, expect, it } from 'vitest'
import { normalizeDesktopScriptImportPayload } from '../../electron/desktopScriptImportValidation'

describe('desktop script import validation', () => {
  it('normalizes valid absolute script paths and preserves the selected mode', () => {
    expect(normalizeDesktopScriptImportPayload({
      files: [{ path: '/workspace/tools/../deploy.py' }],
      mode: 'by-folder',
      rootForGrouping: '/workspace',
    })).toEqual({
      files: [{ path: '/workspace/deploy.py' }],
      mode: 'by-folder',
      rootForGrouping: '/workspace',
    })
  })

  it('rejects relative paths, unsupported modes, and oversized batches', () => {
    expect(() => normalizeDesktopScriptImportPayload({ files: [{ path: 'deploy.py' }], mode: 'misc' })).toThrow('absolute')
    expect(() => normalizeDesktopScriptImportPayload({ files: [{ path: '/workspace/deploy.py' }], mode: 'all' })).toThrow('mode')
    expect(() => normalizeDesktopScriptImportPayload({
      files: Array.from({ length: 2001 }, (_, index) => ({ path: `/workspace/${index}.py` })),
      mode: 'misc',
    })).toThrow('Too many')
  })
})
