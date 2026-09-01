import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext'

// POST /api/auth/logout — clear session cookie
export async function POST(request: Request) {
  const actor = await resolveTrustedRequestContext(request, prisma)
  if (actor?.sessionId) {
    await prisma.userSession.updateMany({
      where: { id: actor.sessionId, userId: actor.actorId, workspaceId: actor.workspaceId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
