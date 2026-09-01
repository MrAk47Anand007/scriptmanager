import { validateSessionToken, SESSION_COOKIE } from '@/lib/auth'

function parseCookieHeader(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) return {}

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const separatorIndex = part.indexOf('=')
      if (separatorIndex === -1) return acc

      const key = part.slice(0, separatorIndex).trim()
      const value = part.slice(separatorIndex + 1).trim()
      if (!key) return acc

      acc[key] = decodeURIComponent(value)
      return acc
    }, {})
}

export function isDesktopSessionToken(token: string | undefined): boolean {
  if (!token?.startsWith('desktop:')) return false

  const secret = process.env.DESKTOP_AUTH_SECRET
  return !!secret && token === `desktop:${secret}`
}

export function isAuthenticatedSessionToken(token: string | undefined): boolean {
  if (!token) return false
  if (isDesktopSessionToken(token)) return true
  return validateSessionToken(token)
}

export function isAuthenticatedCookieHeader(cookieHeader: string | null | undefined): boolean {
  const cookies = parseCookieHeader(cookieHeader)
  return isAuthenticatedSessionToken(cookies[SESSION_COOKIE])
}

export { SESSION_COOKIE }
