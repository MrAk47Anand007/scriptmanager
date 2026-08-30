import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listScriptFiles } from '@/lib/linkedFolders'

const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('linked folder file discovery', () => {
  it.skipIf(process.platform === 'win32')('does not link symlinked files or directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptmanager-linked-'))
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptmanager-linked-outside-'))
    temporaryRoots.push(root, outside)

    fs.writeFileSync(path.join(root, 'local.py'), 'print("local")', 'utf8')
    fs.writeFileSync(path.join(outside, 'outside.py'), 'print("outside")', 'utf8')
    fs.symlinkSync(path.join(outside, 'outside.py'), path.join(root, 'linked.py'))
    fs.symlinkSync(outside, path.join(root, 'linked-folder'), 'dir')

    expect(listScriptFiles(root)).toEqual([path.join(root, 'local.py')])
  })

  it('skips nested folders that cannot be enumerated', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptmanager-linked-'))
    const nested = path.join(root, 'restricted')
    fs.mkdirSync(nested)
    temporaryRoots.push(root)
    const readdirSync = vi.spyOn(fs, 'readdirSync')
      .mockImplementationOnce(() => [{ name: 'restricted', isDirectory: () => true, isSymbolicLink: () => false } as never])
      .mockImplementationOnce(() => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }) })

    expect(listScriptFiles(root)).toEqual([])

    readdirSync.mockRestore()
  })
})
