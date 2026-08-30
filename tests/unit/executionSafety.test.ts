import { describe, expect, it } from 'vitest'
import {
  assertSafeStoredFilename,
  assertSafeBuildId,
  buildRemoteChmodCommand,
  buildRemoteCommand,
  normalizeFilePermissions,
  normalizeRemotePath,
  sanitizeScriptFilename,
} from '@/lib/executionSafety'

describe('execution safety', () => {
  it('removes path traversal and shell metacharacters from imported filenames', () => {
    expect(sanitizeScriptFilename('../../deploy; rm.py')).toBe('deploy_rm.py')
  })

  it('rejects stored filenames containing traversal', () => {
    expect(() => assertSafeStoredFilename('../deploy.py')).toThrow('Unsafe script filename')
  })

  it('rejects build identifiers that could escape the build log directory', () => {
    expect(assertSafeBuildId('build-1_2')).toBe('build-1_2')
    expect(() => assertSafeBuildId('../outside')).toThrow('Unsafe build ID')
    expect(() => assertSafeBuildId('build.log')).toThrow('Unsafe build ID')
  })

  it('quotes remote paths and parameter values', () => {
    expect(buildRemoteCommand('deploy.py', '/tmp/release folder', { TARGET: "prod'west" }))
      .toBe("TARGET='prod'\"'\"'west' python3 '/tmp/release folder/deploy.py'")
  })

  it('rejects unsafe remote transfer paths and chmod modes', () => {
    expect(normalizeRemotePath('/var/lib/script manager')).toBe('/var/lib/script manager')
    expect(normalizeRemotePath(undefined)).toBe('/tmp/')
    expect(() => normalizeRemotePath('/tmp/\n$(touch /tmp/pwned)')).toThrow('Remote path is invalid')
    expect(normalizeFilePermissions('640')).toBe('640')
    expect(() => normalizeFilePermissions('755; id')).toThrow('File permissions are invalid')
    expect(buildRemoteChmodCommand('/tmp/release folder/deploy.py', '755'))
      .toBe("chmod 755 '/tmp/release folder/deploy.py'")
  })
})
