import { describe, expect, it } from 'vitest'
import { planInterruptedRunRecovery, validateBackupManifest } from '@/lib/production/recovery'

describe('release recovery', () => {
  it('resumes only explicitly resumable interrupted nodes', () => {
    expect(planInterruptedRunRecovery([
      { id: 'a', status: 'running', resumable: true },
      { id: 'b', status: 'running', resumable: false },
      { id: 'c', status: 'succeeded', resumable: true },
    ])).toEqual({ resume: ['a'], interrupt: ['b'], preserve: ['c'] })
  })

  it('rejects corrupt or path-mismatched backup manifests', () => {
    expect(() => validateBackupManifest({ format: 1, database: 'other.db', sha256: 'abc', bytes: 10 }, 'backup.db', 'abc', 10)).toThrow('database name')
    expect(() => validateBackupManifest({ format: 1, database: 'backup.db', sha256: 'abc', bytes: 10 }, 'backup.db', 'def', 10)).toThrow('checksum')
  })
})
