import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildLogPath, isManagedBuildLogPath } from '@/lib/buildLogPath'

describe('build log paths', () => {
  it('builds a log path inside the configured build directory', () => {
    const buildsDir = path.resolve('/var/lib/scriptmanager/builds')
    const expected = path.join(buildsDir, 'deploy.py', 'build-1.log')
    expect(buildLogPath(buildsDir, 'deploy.py', 'build-1'))
      .toBe(expected)
  })

  it('rejects log paths outside the managed one-level layout', () => {
    const buildsDir = path.resolve('/var/lib/scriptmanager/builds')
    const validLog = path.join(buildsDir, 'deploy.py', 'build-1.log')
    const outsideLog = path.resolve('/tmp/build-1.log')
    const wrongName = path.join(buildsDir, 'deploy.py', 'other.log')
    expect(isManagedBuildLogPath(buildsDir, validLog, 'build-1')).toBe(true)
    expect(isManagedBuildLogPath(buildsDir, outsideLog, 'build-1')).toBe(false)
    expect(isManagedBuildLogPath(buildsDir, wrongName, 'build-1')).toBe(false)
  })
})
