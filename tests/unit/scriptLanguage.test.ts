import { describe, expect, it } from 'vitest'
import { defaultScriptExtension, inferScriptLanguage } from '@/lib/scriptLanguage'

describe('script language mapping', () => {
  it('treats PowerShell files as PowerShell scripts', () => {
    expect(inferScriptLanguage('/workspace/scripts/backup.ps1')).toBe('powershell')
    expect(defaultScriptExtension('powershell')).toBe('.ps1')
  })
})
