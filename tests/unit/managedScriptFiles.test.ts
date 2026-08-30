import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { moveManagedScriptFile } from '../../electron/managedScriptFiles'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('managed script files', () => {
  it('moves a managed script into the destination collection', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptmanager-managed-'))
    roots.push(root)
    const source = path.join(root, 'old', 'script.py')
    const destination = path.join(root, 'new')
    fs.mkdirSync(path.dirname(source), { recursive: true })
    fs.writeFileSync(source, 'print("managed")', 'utf8')

    expect(moveManagedScriptFile(source, destination, 'script.py')).toBe(path.join(destination, 'script.py'))
    expect(fs.existsSync(source)).toBe(false)
    expect(fs.readFileSync(path.join(destination, 'script.py'), 'utf8')).toBe('print("managed")')
  })

  it('rejects missing sources and overwrites never occur', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptmanager-managed-'))
    roots.push(root)
    const destination = path.join(root, 'new')
    const missing = path.join(root, 'missing.py')
    expect(() => moveManagedScriptFile(missing, destination, 'missing.py')).toThrow('Script file not found')

    const source = path.join(root, 'source.py')
    fs.writeFileSync(source, 'source', 'utf8')
    fs.mkdirSync(destination, { recursive: true })
    fs.writeFileSync(path.join(destination, 'source.py'), 'existing', 'utf8')
    expect(() => moveManagedScriptFile(source, destination, 'source.py')).toThrow('already exists')
    expect(fs.readFileSync(source, 'utf8')).toBe('source')
    expect(fs.readFileSync(path.join(destination, 'source.py'), 'utf8')).toBe('existing')
  })
})
