import { NextResponse } from 'next/server'
import { warmTerminalSession } from '@/lib/socketService'

export async function POST(req: Request) {
  let sessionId: string | null = null

  try {
    const body = await req.json()
    sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null
  } catch {
    sessionId = null
  }

  const warmed = warmTerminalSession(req.headers.get('cookie') ?? undefined, sessionId)

  if (!warmed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ status: 'warmed' })
}
