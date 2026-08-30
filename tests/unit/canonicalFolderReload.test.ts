import { describe, expect, it } from 'vitest'
import { getCanonicalFolderChangeEffect, getCanonicalFolderReloadAction } from '@/lib/canonicalFolderReload'

describe('canonical folder reload decisions', () => {
  const change = {
    type: 'changed' as const,
    collectionId: 'collection-1',
    sourcePath: '/scripts/one.py',
    scriptId: 'script-1',
  }

  it('reloads the active canonical script when its editor is clean', () => {
    expect(getCanonicalFolderReloadAction({
      change,
      activeScriptId: 'script-1',
      activeSourcePath: '/scripts/one.py',
      editorContent: 'print(1)',
      persistedContent: 'print(1)',
    })).toBe('reload')
  })

  it('preserves a recovery draft before reloading a dirty canonical script', () => {
    expect(getCanonicalFolderReloadAction({
      change,
      activeScriptId: 'script-1',
      activeSourcePath: '/scripts/one.py',
      editorContent: 'print(2)',
      persistedContent: 'print(1)',
    })).toBe('recover')
  })

  it('ignores events for another script', () => {
    expect(getCanonicalFolderReloadAction({
      change,
      activeScriptId: 'script-2',
      activeSourcePath: '/scripts/two.py',
      editorContent: 'print(2)',
      persistedContent: 'print(1)',
    })).toBe('ignore')
  })

  it('refreshes workspace metadata even when the changed file is not active', () => {
    expect(getCanonicalFolderChangeEffect({
      change: { ...change, scriptId: 'script-2', sourcePath: '/scripts/two.py' },
      activeScriptId: 'script-1',
      activeSourcePath: '/scripts/one.py',
      editorContent: 'print(1)',
      persistedContent: 'print(1)',
    })).toEqual({ refreshWorkspace: true, reload: 'ignore' })
  })
})
