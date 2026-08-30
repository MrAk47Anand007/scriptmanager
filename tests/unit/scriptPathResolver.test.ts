import path from 'path'
import { describe, expect, it } from 'vitest'
import { resolveScriptSourcePathAfterMove, resolveScriptWorkingDirectory } from '@/lib/scriptPathResolver'

describe('script path resolver', () => {
  it('uses the canonical script parent as the working directory', () => {
    const scriptPath = path.join('/workspace', 'imports', 'nested', 'script.py')

    expect(resolveScriptWorkingDirectory(scriptPath)).toBe(
      path.resolve('/workspace', 'imports', 'nested'),
    )
  })

  it('marks files moved into external folders as canonical sources', () => {
    expect(resolveScriptSourcePathAfterMove('/external/scripts/deploy.py', false)).toBe(
      path.resolve('/external/scripts/deploy.py'),
    )
    expect(resolveScriptSourcePathAfterMove('/workspace/Scripts/deploy.py', true)).toBeNull()
  })
})
