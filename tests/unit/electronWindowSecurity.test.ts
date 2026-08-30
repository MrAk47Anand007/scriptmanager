import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl, isTrustedAppUrl } from '../../electron/windowSecurity'

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

  it('allows only HTTP(S) URLs to leave the application', () => {
    expect(isSafeExternalUrl('https://example.com/docs')).toBe(true)
    expect(isSafeExternalUrl('http://localhost:3000/oauth/callback')).toBe(true)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('data:text/html,<h1>unsafe</h1>')).toBe(false)
    expect(isSafeExternalUrl('mailto:user@example.com')).toBe(false)
    expect(isSafeExternalUrl('not a URL')).toBe(false)
  })
})
