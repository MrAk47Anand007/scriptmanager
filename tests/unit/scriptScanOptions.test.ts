import { describe, expect, it } from 'vitest'
import { SCRIPT_SCAN_EXTENSION_OPTIONS } from '@/lib/scriptScanOptions'

describe('script scan options', () => {
  it('covers every script extension supported by desktop imports', () => {
    expect(SCRIPT_SCAN_EXTENSION_OPTIONS.map((option) => option.ext)).toEqual([
      '.py',
      '.js',
      '.ts',
      '.sh',
      '.ps1',
      '.bat',
    ])
  })
})
