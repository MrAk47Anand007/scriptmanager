import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { redactAgentValue } from '@/lib/agents/redaction'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, 'agent', 'run')
  if (authorization.response) return authorization.response
  const { id } = await context.params
  const run = await prisma.agentRun.findFirst({ where: { id, workspaceId: authorization.context.workspaceId }, select: { id: true } })
  if (!run) return NextResponse.json({ error: 'Agent run not found' }, { status: 404 })
  const body = redactAgentValue(await request.json())
  if (!body || typeof body !== 'object' || !('role' in body) || !('content' in body)) return NextResponse.json({ error: 'role and content are required' }, { status: 400 })
  return NextResponse.json(await prisma.agentMessage.create({ data: { runId: run.id, role: String(body.role), content: String(body.content) } }), { status: 201 })
}
