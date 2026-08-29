import { describe, expect, it } from 'vitest'
import { filterPublicSettings } from '@/lib/settingsVisibility'

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
})
