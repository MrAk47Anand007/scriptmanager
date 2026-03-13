import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthenticatedSessionToken, SESSION_COOKIE } from '@/lib/session'
import { verifyApiToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const config = {
  // Match everything except Next.js internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
  // Run in Node.js runtime, not Edge, so we can use node:crypto
  runtime: 'nodejs',
}

// Public paths that do not require authentication
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/webhooks/',  // Webhook triggers stay unauthenticated
  '/_next/',
  '/favicon.ico',
]

async function hasValidApiToken(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return false

  const stored = await prisma.setting.findUnique({ where: { key: 'api_token_hash' } })
  return verifyApiToken(token, stored?.value)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  // Check for a valid session cookie
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (isAuthenticatedSessionToken(token)) {
    return NextResponse.next()
  }

  // Allow API clients to authenticate with a bearer token
  if (pathname.startsWith('/api/') && await hasValidApiToken(request)) {
    return NextResponse.next()
  }

  // API routes return 401 JSON instead of redirecting
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Redirect browser requests to login page
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('redirect', pathname)
  return NextResponse.redirect(loginUrl)
}
