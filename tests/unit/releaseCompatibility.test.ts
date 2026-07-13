import { describe, expect, it } from 'vitest'
import { assertUpgradeCompatible } from '@/lib/production/compatibility'

describe('release compatibility', () => {
  it('accepts a supported forward upgrade', () => {
    expect(assertUpgradeCompatible({ appVersion: '0.9.0', schemaVersion: 28 }, { appVersion: '1.0.0', minSchemaVersion: 27, maxSchemaVersion: 30 })).toEqual({ compatible: true })
  })

  it('rejects downgrades and unsupported database schemas', () => {
    expect(() => assertUpgradeCompatible({ appVersion: '2.0.0', schemaVersion: 30 }, { appVersion: '1.0.0', minSchemaVersion: 27, maxSchemaVersion: 30 })).toThrow('downgrade')
    expect(() => assertUpgradeCompatible({ appVersion: '0.9.0', schemaVersion: 31 }, { appVersion: '1.0.0', minSchemaVersion: 27, maxSchemaVersion: 30 })).toThrow('schema version 31')
  })
})
