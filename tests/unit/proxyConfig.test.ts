import { describe, expect, it } from 'vitest'
import { config } from '@/proxy'

describe('Next proxy configuration', () => {
  it('does not export an unsupported runtime segment setting', () => {
    expect('runtime' in config).toBe(false)
  })
})
