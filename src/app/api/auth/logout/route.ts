import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'

// POST /api/auth/logout — clear session cookie
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
