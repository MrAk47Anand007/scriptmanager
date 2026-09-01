import { NextResponse } from 'next/server'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, 'agent', 'run')
  if (authorization.response) return authorization.response
  return NextResponse.json({ error: 'Resume requires ScriptManager Desktop', desktopHostRequired: true }, { status: 409 })
}
