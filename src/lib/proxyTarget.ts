import dns from 'node:dns/promises'
import net from 'node:net'

export const PRIVATE_HOST_ERROR = 'Requests to localhost or private network addresses are blocked by default'
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 10

export class ProxyTargetError extends Error {}

function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false
  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  return false
}

function isPrivateIPv6(host: string): boolean {
  const normalized = host.toLowerCase()
  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
    || normalized === '::ffff:127.0.0.1'
}

function isBlockedIp(host: string): boolean {
  const ipVersion = net.isIP(host)
  if (ipVersion === 4) return isPrivateIPv4(host)
  if (ipVersion === 6) return isPrivateIPv6(host)
  return false
}

export async function validateProxyTarget(rawUrl: string): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return { ok: false, error: 'Invalid URL' }
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { ok: false, error: 'Only http and https URLs are supported' }
  }

  if (process.env.ALLOW_PRIVATE_PROXY_TARGETS === 'true') {
    return { ok: true, url: parsedUrl }
  }

  const hostname = parsedUrl.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || isBlockedIp(hostname)) {
    return { ok: false, error: PRIVATE_HOST_ERROR }
  }

  try {
    const records = await dns.lookup(parsedUrl.hostname, { all: true, verbatim: true })
    if (records.some((record) => isBlockedIp(record.address))) {
      return { ok: false, error: PRIVATE_HOST_ERROR }
    }
  } catch {
    return { ok: false, error: 'Failed to resolve target host' }
  }

  return { ok: true, url: parsedUrl }
}

function shouldRewriteToGet(status: number, method: string): boolean {
  return status === 303 || ((status === 301 || status === 302) && ['POST', 'PUT', 'PATCH'].includes(method))
}

export async function fetchWithSafeRedirects(rawUrl: string, init: RequestInit = {}): Promise<{ response: Response; finalUrl: string }> {
  let target = await validateProxyTarget(rawUrl)
  if (!target.ok) throw new ProxyTargetError(target.error)

  let currentUrl = target.url
  let currentInit: RequestInit = { ...init, headers: new Headers(init.headers) }

  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await fetch(currentUrl.toString(), { ...currentInit, redirect: 'manual' })
    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: currentUrl.toString() }
    }

    const location = response.headers.get('location')
    if (!location) return { response, finalUrl: currentUrl.toString() }
    if (redirectCount >= MAX_REDIRECTS) throw new Error('Too many redirects')

    let nextUrl: URL
    try {
      nextUrl = new URL(location, currentUrl)
    } catch {
      throw new ProxyTargetError('Invalid redirect URL')
    }
    target = await validateProxyTarget(nextUrl.toString())
    if (!target.ok) throw new ProxyTargetError(target.error)

    const nextInit: RequestInit = { ...currentInit }
    const method = String(currentInit.method ?? 'GET').toUpperCase()
    const nextHeaders = new Headers(currentInit.headers)
    if (shouldRewriteToGet(response.status, method)) {
      nextInit.method = 'GET'
      delete nextInit.body
      nextHeaders.delete('content-type')
      nextHeaders.delete('content-length')
    }
    if (nextUrl.origin !== currentUrl.origin) {
      nextHeaders.delete('authorization')
      nextHeaders.delete('cookie')
      nextHeaders.delete('proxy-authorization')
    }
    nextInit.headers = nextHeaders
    currentInit = nextInit
    currentUrl = target.url
  }
}
