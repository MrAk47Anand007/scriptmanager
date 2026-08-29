import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { atomicWriteLocalFile, getConflictCopyPath } from '@/lib/storage/localFile'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.promises.rm(root, { recursive: true, force: true })))
})

describe('local sync file writer', () => {
  it('atomically replaces a local file and creates missing parent folders', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'scriptmanager-local-file-'))
    roots.push(root)
    const target = path.join(root, 'nested', 'script.py')

    atomicWriteLocalFile(target, Buffer.from('updated'))

    await expect(fs.promises.readFile(target, 'utf8')).resolves.toBe('updated')
  })

  it('chooses a non-destructive conflict path when a timestamped copy exists', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'scriptmanager-conflict-'))
    roots.push(root)
    const target = path.join(root, 'script.py')
    await fs.promises.writeFile(`${root}/script.conflict-20260829235959.py`, 'existing')

    const timestamp = new Date(2026, 7, 29, 23, 59, 59)
    expect(getConflictCopyPath(target, timestamp))
      .toBe(path.join(root, `script.conflict-${timestamp.getFullYear()}08${timestamp.getDate()}235959-2.py`))
  })
})
