import { describe, expect, it } from 'vitest'
import { getDevServerEnvironment } from '../../scripts/dev-server-environment.mjs'

describe('development server environment', () => {
  it('provides the local SQLite database when the shell has no database URL', () => {
    expect(getDevServerEnvironment({}).DATABASE_URL).toBe('file:./data/scriptmanager.db')
  })

  it('preserves an explicit database URL', () => {
    expect(getDevServerEnvironment({ DATABASE_URL: 'file:./custom.db' }).DATABASE_URL).toBe('file:./custom.db')
  })
})
