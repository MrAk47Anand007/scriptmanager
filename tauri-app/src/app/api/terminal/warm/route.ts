import { NextResponse } from 'next/server'
import { warmTerminalSession } from '@/lib/socketService'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  const authorization = await authorizeRequest(req, 'ops', 'run')
  if (authorization.response) return authorization.response
  let sessionId: string | null = null

  try {
    const body = await req.json()
    sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null
  } catch {
    sessionId = null
  }

  let warmed: boolean
  try {
    warmed = await warmTerminalSession(req.headers.get('cookie') ?? undefined, sessionId)
  } catch {
    return NextResponse.json({ error: 'Terminal runtime unavailable' }, { status: 503 })
  }

  if (!warmed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ status: 'warmed' })
}
