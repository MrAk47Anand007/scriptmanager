import { describe, expect, it } from 'vitest'
import { buildLogPath, isManagedBuildLogPath } from '@/lib/buildLogPath'

describe('build log paths', () => {
  it('builds a log path inside the configured build directory', () => {
    expect(buildLogPath('/var/lib/scriptmanager/builds', 'deploy.py', 'build-1'))
      .toBe('/var/lib/scriptmanager/builds/deploy.py/build-1.log')
  })

  it('rejects log paths outside the managed one-level layout', () => {
    expect(isManagedBuildLogPath('/var/lib/scriptmanager/builds', '/var/lib/scriptmanager/builds/deploy.py/build-1.log', 'build-1')).toBe(true)
    expect(isManagedBuildLogPath('/var/lib/scriptmanager/builds', '/tmp/build-1.log', 'build-1')).toBe(false)
    expect(isManagedBuildLogPath('/var/lib/scriptmanager/builds', '/var/lib/scriptmanager/builds/deploy.py/other.log', 'build-1')).toBe(false)
  })
})
