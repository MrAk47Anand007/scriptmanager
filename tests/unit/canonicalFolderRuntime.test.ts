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
})
