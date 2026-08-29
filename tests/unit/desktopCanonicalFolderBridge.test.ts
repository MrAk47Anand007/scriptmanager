// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  discardCanonicalRecoveryDraft,
  listCanonicalRecoveryDrafts,
  rescanCanonicalFolder,
  cancelDesktopRun,
  moveDesktopScript,
  saveCanonicalRecoveryDraft,
  subscribeToCanonicalFolderChanges,
} from '@/lib/scriptsRuntimeClient'

afterEach(() => {
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('desktop canonical folder bridge', () => {
  it('uses preload for canonical folder rescans and recovery drafts without HTTP', async () => {
    const rescan = vi.fn().mockResolvedValue({ imported_count: 2 })
    const listDrafts = vi.fn().mockResolvedValue([])
    const saveDraft = vi.fn().mockResolvedValue({ id: 'draft-1' })
    const discardDraft = vi.fn().mockResolvedValue(undefined)
    window.scriptManagerDesktop = {
      runtime: {
        rescanCanonicalFolder: rescan,
        listCanonicalRecoveryDrafts: listDrafts,
        saveCanonicalRecoveryDraft: saveDraft,
        discardCanonicalRecoveryDraft: discardDraft,
      },
    } as never
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('HTTP must not be used in desktop mode') }))

    await expect(rescanCanonicalFolder('collection-1')).resolves.toMatchObject({ imported_count: 2 })
    await expect(listCanonicalRecoveryDrafts('script-1')).resolves.toEqual([])
    await expect(saveCanonicalRecoveryDraft({ scriptId: 'script-1', sourcePath: '/scripts/one.py', sourceRevision: '1:1', content: 'draft' })).resolves.toMatchObject({ id: 'draft-1' })
    await expect(discardCanonicalRecoveryDraft('draft-1')).resolves.toBeUndefined()
  })

  it('subscribes to canonical folder changes through preload and cleans up the listener', () => {
    const unsubscribe = vi.fn()
    const subscribe = vi.fn((listener: (event: unknown) => void) => {
      listener({ type: 'changed', collectionId: 'collection-1', sourcePath: '/scripts/one.py', scriptId: 'script-1' })
      return unsubscribe
    })
    const listener = vi.fn()
    window.scriptManagerDesktop = {
      runtime: {
        onCanonicalFolderChange: subscribe,
      },
    } as never

    const stop = subscribeToCanonicalFolderChanges(listener)

    expect(subscribe).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({
      type: 'changed',
      collectionId: 'collection-1',
      sourcePath: '/scripts/one.py',
      scriptId: 'script-1',
    })
    stop()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('cancels a desktop run through preload', async () => {
    const cancel = vi.fn().mockResolvedValue({ ok: true })
    window.scriptManagerDesktop = { runtime: { cancelRun: cancel } } as never

    await expect(cancelDesktopRun('build-1')).resolves.toEqual({ ok: true })
    expect(cancel).toHaveBeenCalledWith('build-1')
  })

  it('moves a script through preload in desktop mode', async () => {
    const move = vi.fn().mockResolvedValue({ scriptId: 'script-1', collectionId: 'collection-2' })
    window.scriptManagerDesktop = { runtime: { moveScript: move } } as never

    await expect(moveDesktopScript('script-1', 'collection-2')).resolves.toEqual({ scriptId: 'script-1', collectionId: 'collection-2' })
    expect(move).toHaveBeenCalledWith({ scriptId: 'script-1', collectionId: 'collection-2' })
  })
})
