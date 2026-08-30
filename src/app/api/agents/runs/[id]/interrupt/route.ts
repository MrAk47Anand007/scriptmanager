import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, 'agent', 'run')
  if (authorization.response) return authorization.response
  if (request.headers.get('x-scriptmanager-desktop') !== '1') return NextResponse.json({ error: 'Interrupt requires ScriptManager Desktop', desktopHostRequired: true }, { status: 409 })
  const { id } = await context.params
  const run = await prisma.agentRun.findFirst({ where: { id, workspaceId: authorization.context.workspaceId }, select: { id: true } })
  if (!run) return NextResponse.json({ error: 'Agent run not found' }, { status: 404 })
  return NextResponse.json(await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'interrupted' } }))
}
