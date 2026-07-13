import { describe, expect, it } from 'vitest'
import { checkRateLimit, readBoundedBody, securityHeaders, verifyReplayWindow } from '@/lib/production/httpSecurity'

describe('release HTTP security', () => {
  it('limits requests per identity and resets after the window', () => {
    const state = new Map()
    expect(checkRateLimit(state, 'client', 1_000, { limit: 2, windowMs: 100 })).toMatchObject({ allowed: true, remaining: 1 })
    expect(checkRateLimit(state, 'client', 1_010, { limit: 2, windowMs: 100 })).toMatchObject({ allowed: true, remaining: 0 })
    expect(checkRateLimit(state, 'client', 1_020, { limit: 2, windowMs: 100 })).toMatchObject({ allowed: false, retryAfterMs: 80 })
    expect(checkRateLimit(state, 'client', 1_101, { limit: 2, windowMs: 100 })).toMatchObject({ allowed: true, remaining: 1 })
  })

  it('rejects oversized request bodies before parsing', async () => {
    const request = new Request('http://local.test', { method: 'POST', body: '12345' })
    await expect(readBoundedBody(request, 4)).rejects.toThrow('Request body exceeds 4 bytes')
  })

  it('rejects stale or future replay timestamps', () => {
    expect(verifyReplayWindow('1000', 1_100_000, 200_000)).toBe(1_000_000)
    expect(() => verifyReplayWindow('1000', 1_500_001, 200_000)).toThrow('outside the allowed replay window')
    expect(() => verifyReplayWindow('2000', 1_500_000, 200_000)).toThrow('outside the allowed replay window')
  })

  it('publishes restrictive browser security headers', () => {
    const headers = Object.fromEntries(securityHeaders.map(({ key, value }) => [key, value]))
    expect(headers['Content-Security-Policy']).toContain("default-src 'self'")
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('no-referrer')
  })
})
