import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, 'agent', 'read')
  if (authorization.response) return authorization.response
  return NextResponse.json(await prisma.agentRun.findMany({ where: { workspaceId: authorization.context.workspaceId }, include: { profile: true }, orderBy: { createdAt: 'desc' } }))
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, 'agent', 'run')
  if (authorization.response) return authorization.response
  return NextResponse.json({ error: 'Local agent providers require ScriptManager Desktop', desktopHostRequired: true }, { status: 409 })
}
