import { describe, expect, it } from 'vitest'
import { inferScriptDraft } from '@/lib/scriptDraft'

describe('script draft inference', () => {
  it('creates a shell draft for Windows batch scripts', () => {
    expect(inferScriptDraft('deploy.bat', 'general')).toEqual({
      finalName: 'deploy.bat',
      language: 'shell',
      content: '@echo off\necho "Hello World"',
    })
  })

  it('uses the collection runtime when a new script has no extension', () => {
    expect(inferScriptDraft('deploy', 'node')).toEqual({
      finalName: 'deploy.js',
      language: 'node',
      content: 'console.log("Hello World");',
    })
  })
})
