import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { randomUUID } from 'node:crypto'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, 'agent', 'read')
  if (authorization.response) return authorization.response
  return NextResponse.json(await prisma.agentRun.findMany({ where: { workspaceId: authorization.context.workspaceId }, include: { profile: true }, orderBy: { createdAt: 'desc' } }))
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, 'agent', 'run')
  if (authorization.response) return authorization.response
  if (request.headers.get('x-scriptmanager-desktop') !== '1') return NextResponse.json({ error: 'Local agent providers require ScriptManager Desktop', desktopHostRequired: true }, { status: 409 })
  const workspaceId = authorization.context.workspaceId
  const body = await request.json(); const profile = await prisma.agentProfile.findFirst({ where: { id: body.profileId, workspaceId } })
  if (!profile || !body.prompt || !body.cwd) return NextResponse.json({ error: 'profileId, prompt, and cwd are required' }, { status: 400 })
  const run = await prisma.agentRun.create({ data: { profileId: profile.id, provider: profile.provider, workspaceId: profile.workspaceId, initiatedBy: authorization.context.userId, correlationId: randomUUID(), inputJson: JSON.stringify({ prompt: body.prompt }), status: 'running', startedAt: new Date() } })
  await prisma.agentMessage.create({ data: { runId: run.id, role: 'user', content: body.prompt } })
  return NextResponse.json({ ...run, providerSessionId: run.id, cwd: body.cwd }, { status: 201 })
}
