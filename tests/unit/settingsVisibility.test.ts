import { describe, expect, it } from 'vitest'
import { filterPublicSettings, parsePublicSettings } from '@/lib/settingsVisibility'

describe('settings visibility', () => {
  it('removes credential values from settings exposed to clients', () => {
    expect(filterPublicSettings({
      theme: 'dark',
      github_token: 'github-secret-token',
      gist_sync_enabled: 'true',
    })).toEqual({
      theme: 'dark',
      gist_sync_enabled: 'true',
    })
  })

  it('accepts only bounded string values for public settings', () => {
    expect(parsePublicSettings({ theme: 'dark', gist_sync_enabled: 'true' })).toEqual({ theme: 'dark', gist_sync_enabled: 'true' })
    expect(() => parsePublicSettings({ github_token: 'secret' })).toThrow('secret vault')
    expect(() => parsePublicSettings({ theme: 42 })).toThrow('string')
    expect(() => parsePublicSettings(null)).toThrow('payload')
  })
})
