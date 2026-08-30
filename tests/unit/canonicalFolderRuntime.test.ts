import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertPathWithinRoot, createCanonicalFolderWatcher, readCanonicalFile, writeCanonicalFile } from '../../electron/canonicalFolderRuntime'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.promises.rm(directory, { recursive: true, force: true })))
})

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptmanager-canonical-'))
  temporaryDirectories.push(root)
  const sourcePath = path.join(root, 'script.py')
  fs.writeFileSync(sourcePath, 'print("canonical")', 'utf8')
  return { root, sourcePath }
}

describe('canonical folder runtime', () => {
  it('rejects a script path outside its canonical folder', () => {
    const { root } = createFixture()
    expect(() => assertPathWithinRoot(root, path.join(root, '..', 'outside.py'))).toThrow('outside its canonical folder')
  })

  it('writes a canonical file in place and changes its revision', async () => {
    const { root, sourcePath } = createFixture()
    const before = await readCanonicalFile(root, sourcePath)

    const after = await writeCanonicalFile(root, sourcePath, 'print("updated")')

    expect(await fs.promises.readFile(sourcePath, 'utf8')).toBe('print("updated")')
    expect(after.revision).not.toBe(before.revision)
    expect(after.content).toBe('print("updated")')
  })

  it.skipIf(process.platform === 'win32')('rejects reading a symlinked canonical file', async () => {
    const { root, sourcePath } = createFixture()
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptmanager-canonical-outside-'))
    temporaryDirectories.push(outsideRoot)
    const outsidePath = path.join(outsideRoot, 'outside.py')
    await fs.promises.writeFile(outsidePath, 'print("outside")', 'utf8')
    await fs.promises.unlink(sourcePath)
    await fs.promises.symlink(outsidePath, sourcePath)

    await expect(readCanonicalFile(root, sourcePath)).rejects.toThrow('symlink')
  })

  it.skipIf(process.platform === 'win32')('rejects writing through a symlinked canonical file', async () => {
    const { root, sourcePath } = createFixture()
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptmanager-canonical-outside-'))
    temporaryDirectories.push(outsideRoot)
    const outsidePath = path.join(outsideRoot, 'outside.py')
    await fs.promises.writeFile(outsidePath, 'print("outside")', 'utf8')
    await fs.promises.unlink(sourcePath)
    await fs.promises.symlink(outsidePath, sourcePath)

    await expect(writeCanonicalFile(root, sourcePath, 'print("should not write")')).rejects.toThrow('symlink')
    await expect(fs.promises.readFile(outsidePath, 'utf8')).resolves.toBe('print("outside")')
  })

  it('emits a changed event after an external canonical file write', async () => {
    const { root, sourcePath } = createFixture()
    const events: Array<{ type: string; collectionId: string; sourcePath?: string }> = []
    const watcher = createCanonicalFolderWatcher({ onChange: (event) => events.push(event), debounceMs: 10 })
    watcher.watch('collection-1', root)

    await fs.promises.writeFile(sourcePath, 'print("external")', 'utf8')

    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'changed', collectionId: 'collection-1', sourcePath })))
    watcher.close()
  })

  it('emits a changed event for an external write in a nested canonical folder', async () => {
    const { root } = createFixture()
    const nestedFolder = path.join(root, 'nested')
    const sourcePath = path.join(nestedFolder, 'script.py')
    await fs.promises.mkdir(nestedFolder)
    await fs.promises.writeFile(sourcePath, 'print("canonical")', 'utf8')
    const events: Array<{ type: string; collectionId: string; sourcePath?: string }> = []
    const watcher = createCanonicalFolderWatcher({ onChange: (event) => events.push(event), debounceMs: 10 })
    watcher.watch('collection-1', root)

    await fs.promises.writeFile(sourcePath, 'print("external")', 'utf8')

    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'changed', collectionId: 'collection-1', sourcePath })))
    watcher.close()
  })

  it('emits a deleted event when a canonical file is removed', async () => {
    const { root, sourcePath } = createFixture()
    const events: Array<{ type: string; collectionId: string; sourcePath?: string }> = []
    const watcher = createCanonicalFolderWatcher({ onChange: (event) => events.push(event), debounceMs: 10 })
    watcher.watch('collection-1', root)

    await fs.promises.unlink(sourcePath)

    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'deleted', collectionId: 'collection-1', sourcePath })))
    watcher.close()
  })

  it('continues watching a nested folder created after startup', async () => {
    const { root } = createFixture()
    const nestedFolder = path.join(root, 'created-later')
    const sourcePath = path.join(nestedFolder, 'script.py')
    const events: Array<{ type: string; collectionId: string; sourcePath?: string }> = []
    const watcher = createCanonicalFolderWatcher({ onChange: (event) => events.push(event), debounceMs: 10 })
    watcher.watch('collection-1', root)

    await fs.promises.mkdir(nestedFolder)
    await fs.promises.writeFile(sourcePath, 'print("external")', 'utf8')

    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'changed', collectionId: 'collection-1', sourcePath })))
    watcher.close()
  })

  it('keeps watching when a nested folder cannot be enumerated', () => {
    const { root } = createFixture()
    const nestedFolder = path.join(root, 'restricted')
    fs.mkdirSync(nestedFolder)
    const readdirSync = vi.spyOn(fs, 'readdirSync')
      .mockImplementationOnce(() => [{ name: 'restricted', isDirectory: () => true } as never])
      .mockImplementationOnce(() => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }) })
    const watcher = createCanonicalFolderWatcher({ onChange: vi.fn(), debounceMs: 10 })

    expect(() => watcher.watch('collection-1', root)).not.toThrow()

    watcher.close()
    readdirSync.mockRestore()
  })

  it('reports both sides of a canonical file rename', async () => {
    const { root, sourcePath } = createFixture()
    const renamedPath = path.join(root, 'renamed.py')
    const events: Array<{ type: string; collectionId: string; sourcePath?: string }> = []
    const watcher = createCanonicalFolderWatcher({ onChange: (event) => events.push(event), debounceMs: 10 })
    watcher.watch('collection-1', root)

    await fs.promises.rename(sourcePath, renamedPath)

    await vi.waitFor(() => {
      expect(events).toContainEqual(expect.objectContaining({ type: 'deleted', collectionId: 'collection-1', sourcePath }))
      expect(events).toContainEqual(expect.objectContaining({ type: 'changed', collectionId: 'collection-1', sourcePath: renamedPath }))
    })
    watcher.close()
  })
})
