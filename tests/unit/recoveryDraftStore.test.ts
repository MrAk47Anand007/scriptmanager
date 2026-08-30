import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRecoveryDraftStore } from '../../electron/recoveryDraftStore'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.promises.rm(directory, { recursive: true, force: true })))
})

describe('recovery draft store', () => {
  it('persists an unsaved editor draft without changing the canonical file', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptmanager-drafts-'))
    temporaryDirectories.push(rootDir)
    const sourcePath = path.join(rootDir, 'script.py')
    await fs.promises.writeFile(sourcePath, 'print("canonical")', 'utf8')
    const drafts = createRecoveryDraftStore({ rootDir })

    const saved = await drafts.save({
      scriptId: 'script-1',
      sourcePath,
      sourceRevision: '1:18',
      content: 'print("unsaved")',
    })

    expect(await drafts.read(saved.id)).toMatchObject({ id: saved.id, content: 'print("unsaved")', scriptId: 'script-1' })
    expect(await fs.promises.readFile(sourcePath, 'utf8')).toBe('print("canonical")')
  })

  it('lists and discards drafts for one script without affecting other scripts', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptmanager-drafts-'))
    temporaryDirectories.push(rootDir)
    const drafts = createRecoveryDraftStore({ rootDir })
    const first = await drafts.save({ scriptId: 'script-1', sourcePath: '/scripts/one.py', sourceRevision: '1:1', content: 'one' })
    await drafts.save({ scriptId: 'script-2', sourcePath: '/scripts/two.py', sourceRevision: '1:1', content: 'two' })

    expect(await drafts.list('script-1')).toEqual([expect.objectContaining({ id: first.id })])
    await drafts.discard(first.id)
    await expect(drafts.read(first.id)).rejects.toThrow('Recovery draft not found')
    expect(await drafts.list('script-2')).toHaveLength(1)
  })

  it('rejects path-like script and draft identifiers', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptmanager-drafts-'))
    temporaryDirectories.push(rootDir)
    const drafts = createRecoveryDraftStore({ rootDir })

    await expect(drafts.save({
      scriptId: '../outside',
      sourcePath: '/scripts/one.py',
      sourceRevision: '1:1',
      content: 'draft',
    })).rejects.toThrow('Invalid recovery draft script id')
    await expect(drafts.list('../outside')).rejects.toThrow('Invalid recovery draft script id')
    await expect(drafts.read('../outside')).rejects.toThrow('Invalid recovery draft id')
    await expect(drafts.discard('../outside')).rejects.toThrow('Invalid recovery draft id')
  })
})
