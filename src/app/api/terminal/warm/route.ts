import { NextResponse } from 'next/server'
import { warmTerminalSession } from '@/lib/socketService'

export async function POST(req: Request) {
  const warmed = warmTerminalSession(req.headers.get('cookie') ?? undefined)

  if (!warmed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ status: 'warmed' })
}
