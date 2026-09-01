import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, 'agent', 'read')
  if (authorization.response) return authorization.response
  const { id } = await context.params
  const run = await prisma.agentRun.findFirst({ where: { id, workspaceId: authorization.context.workspaceId }, include: { profile: true, messages: { orderBy: { createdAt: 'asc' } }, artifacts: { orderBy: { createdAt: 'asc' } }, permissionGrants: true } })
  return run ? NextResponse.json(run) : NextResponse.json({ error: 'Agent run not found' }, { status: 404 })
}
