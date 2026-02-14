import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = {
  // Match everything except Next.js internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
  // Run in Node.js runtime, not Edge, so we can use node:crypto
  runtime: 'nodejs',
}

const SESSION_COOKIE = 'sm_session'
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'scriptmanager-dev-secret-change-me'

// Public paths that do not require authentication
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/webhooks/',  // Webhook triggers stay unauthenticated
  '/_next/',
  '/favicon.ico',
]

function validateToken(token: string | undefined): boolean {
  if (!token) return false
  try {
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return false

    // Re-implement sign using synchronous Node.js crypto (available in Node.js runtime middleware)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto') as typeof import('crypto')
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url')
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false

    const { expiry } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return Date.now() < expiry
  } catch {
    return false
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  // Check for a valid session cookie
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (validateToken(token)) {
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
