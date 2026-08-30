import { describe, expect, it } from 'vitest'
import { isTrustedAppUrl } from '../../electron/windowSecurity'

describe('electron window security', () => {
  it('trusts only the local application origin', () => {
    expect(isTrustedAppUrl('http://localhost:3141/agents', 3141)).toBe(true)
    expect(isTrustedAppUrl('http://localhost:3141/login?next=%2F', 3141)).toBe(true)
  })

  it('rejects origins that could inherit the preload bridge', () => {
    expect(isTrustedAppUrl('https://localhost:3141/agents', 3141)).toBe(false)
    expect(isTrustedAppUrl('http://127.0.0.1:3141/agents', 3141)).toBe(false)
    expect(isTrustedAppUrl('http://localhost.evil.example/agents', 3141)).toBe(false)
    expect(isTrustedAppUrl('http://localhost:3000/agents', 3141)).toBe(false)
    expect(isTrustedAppUrl('data:text/html,<h1>unsafe</h1>', 3141)).toBe(false)
    expect(isTrustedAppUrl('not a URL', 3141)).toBe(false)
  })
})
