import { afterEach, describe, expect, it, vi } from 'vitest'

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }))
vi.mock('node:dns/promises', () => ({ default: { lookup: lookupMock } }))

import { fetchWithSafeRedirects, validateProxyTarget } from '@/lib/proxyTarget'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  delete process.env.ALLOW_PRIVATE_PROXY_TARGETS
})

describe('proxy target policy', () => {
  it('rejects direct localhost and private network targets', async () => {
    await expect(validateProxyTarget('http://127.0.0.1:3000')).resolves.toMatchObject({ ok: false })
    await expect(validateProxyTarget('http://localhost:3000')).resolves.toMatchObject({ ok: false })
  })

  it('revalidates redirects and does not follow a private destination', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1:3000/admin' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchWithSafeRedirects('https://public.test/start', { method: 'GET' }))
      .rejects.toThrow('private network addresses are blocked')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('removes credentials when following a cross-origin redirect', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://other.test/next' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchWithSafeRedirects('https://public.test/start', {
      method: 'GET',
      headers: { Authorization: 'Bearer secret', Cookie: 'session=secret' },
    })).resolves.toMatchObject({ finalUrl: 'https://other.test/next' })

    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit
    const headers = new Headers(secondRequest.headers)
    expect(headers.has('authorization')).toBe(false)
    expect(headers.has('cookie')).toBe(false)
  })
})
