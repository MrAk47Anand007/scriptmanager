import { describe, expect, it } from 'vitest'
import {
  assertSafeStoredFilename,
  buildRemoteCommand,
  sanitizeScriptFilename,
} from '@/lib/executionSafety'

describe('execution safety', () => {
  it('removes path traversal and shell metacharacters from imported filenames', () => {
    expect(sanitizeScriptFilename('../../deploy; rm.py')).toBe('deploy_rm.py')
  })

  it('rejects stored filenames containing traversal', () => {
    expect(() => assertSafeStoredFilename('../deploy.py')).toThrow('Unsafe script filename')
  })

  it('quotes remote paths and parameter values', () => {
    expect(buildRemoteCommand('deploy.py', '/tmp/release folder', { TARGET: "prod'west" }))
      .toBe("TARGET='prod'\"'\"'west' python3 '/tmp/release folder/deploy.py'")
  })
})
