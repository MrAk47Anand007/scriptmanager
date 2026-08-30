import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, 'agent', 'read')
  if (authorization.response) return authorization.response
  return NextResponse.json(await prisma.agentProfile.findMany({ where: { workspaceId: authorization.context.workspaceId }, include: { providerConfig: true }, orderBy: { createdAt: 'desc' } }))
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, 'agent', 'create')
  if (authorization.response) return authorization.response
  const body = await request.json()
  const workspaceId = authorization.context.workspaceId
  if (!body.name || !['codex', 'claude'].includes(body.provider) || !['observe', 'develop', 'full'].includes(body.accessLevel)) return NextResponse.json({ error: 'name, provider, and an explicit accessLevel are required' }, { status: 400 })
  if (body.projectId) { const project = await prisma.project.findFirst({ where: { id: body.projectId, workspaceId } }); if (!project?.repositoryRoot) return NextResponse.json({ error: 'Selected project is not connected to a repository in this workspace' }, { status: 400 }) }
  return NextResponse.json(await prisma.agentProfile.create({ data: { name: body.name, provider: body.provider, providerConfigId: body.providerConfigId, accessLevel: body.accessLevel, workspaceId, projectId: body.projectId, model: body.model, systemPrompt: body.systemPrompt ?? '' } }), { status: 201 })
}
