import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyPassword, hashPassword, createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'

function isLoopbackValue(value: string | null | undefined): boolean {
  if (!value) return false

  const normalized = value.trim().toLowerCase()
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '::ffff:127.0.0.1'
}

function canInitializePassword(req: Request): boolean {
  if (process.env.ALLOW_REMOTE_INITIAL_SETUP === 'true') {
    return true
  }

  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = req.headers.get('x-real-ip')?.trim()
  const hostname = (() => {
    try {
      return new URL(req.url).hostname
    } catch {
      return null
    }
  })()

  return isLoopbackValue(forwardedFor) || isLoopbackValue(realIp) || isLoopbackValue(hostname)
}

// HEAD /api/auth/login — returns 204 if no password is set (first run), 200 if password is set
export async function HEAD(req: Request) {
  const stored = await prisma.setting.findUnique({ where: { key: 'auth_password_hash' } })
  const initialSetupAllowed = canInitializePassword(req)

  return new Response(null, {
    status: stored?.value ? 200 : 204,
    headers: {
      'x-initial-setup-allowed': initialSetupAllowed ? 'true' : 'false',
    },
  })
}

// POST /api/auth/login — verify password, set session cookie
export async function POST(req: Request) {
  const { password } = await req.json()
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Password required' }, { status: 400 })
  }

  const stored = await prisma.setting.findUnique({ where: { key: 'auth_password_hash' } })

  if (!stored?.value) {
    if (!canInitializePassword(req)) {
      return NextResponse.json(
        { error: 'Initial password setup is only allowed from localhost. Set ALLOW_REMOTE_INITIAL_SETUP=true to override.' },
        { status: 403 }
      )
    }

    // First-run: no password set yet — auto-accept and store
    const hash = await hashPassword(password)
    await prisma.setting.upsert({
      where: { key: 'auth_password_hash' },
      update: { value: hash },
      create: { key: 'auth_password_hash', value: hash },
    })
  } else {
    const valid = await verifyPassword(password, stored.value)
    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }
  }

  const identity = await ensureDefaultWorkspace(prisma)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const session = await prisma.userSession.create({ data: {
    ...identity, tokenHash: `pending-${crypto.randomUUID()}`, expiresAt,
    userAgent: req.headers.get('user-agent'), ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip'),
  } })
  const token = createSessionToken({ ...identity, sessionId: session.id })
  await prisma.userSession.update({ where: { id: session.id }, data: { tokenHash: hashSessionToken(token) } })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 24 * 60 * 60, // 24 hours in seconds
  })
  return res
}
