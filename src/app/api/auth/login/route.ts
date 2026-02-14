import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyPassword, hashPassword, createSessionToken, SESSION_COOKIE } from '@/lib/auth'

// HEAD /api/auth/login — returns 204 if no password is set (first run), 200 if password is set
export async function HEAD() {
  const stored = await prisma.setting.findUnique({ where: { key: 'auth_password_hash' } })
  return new Response(null, { status: stored?.value ? 200 : 204 })
}

// POST /api/auth/login — verify password, set session cookie
export async function POST(req: Request) {
  const { password } = await req.json()
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Password required' }, { status: 400 })
  }

  const stored = await prisma.setting.findUnique({ where: { key: 'auth_password_hash' } })

  if (!stored?.value) {
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

  const token = createSessionToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60, // 24 hours in seconds
  })
  return res
}
