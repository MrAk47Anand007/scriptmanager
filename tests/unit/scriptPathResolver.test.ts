import path from 'path'
import { describe, expect, it } from 'vitest'
import { resolveScriptWorkingDirectory } from '@/lib/scriptPathResolver'

describe('script path resolver', () => {
  it('uses the canonical script parent as the working directory', () => {
    const scriptPath = path.join('/workspace', 'imports', 'nested', 'script.py')

    expect(resolveScriptWorkingDirectory(scriptPath)).toBe(
      path.resolve('/workspace', 'imports', 'nested'),
    )
  })
})
