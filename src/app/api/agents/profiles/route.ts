import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) { return NextResponse.json(await prisma.agentProfile.findMany({ where: { workspaceId: new URL(request.url).searchParams.get('workspaceId') ?? 'default' }, include: { providerConfig: true }, orderBy: { createdAt: 'desc' } })) }
export async function POST(request: Request) {
  const body = await request.json()
  if (!body.name || !['codex', 'claude'].includes(body.provider) || !['observe', 'develop', 'full'].includes(body.accessLevel)) return NextResponse.json({ error: 'name, provider, and an explicit accessLevel are required' }, { status: 400 })
  if (body.projectId) { const project = await prisma.project.findUnique({ where: { id: body.projectId } }); if (!project?.repositoryRoot) return NextResponse.json({ error: 'Selected project is not connected to a repository' }, { status: 400 }) }
  return NextResponse.json(await prisma.agentProfile.create({ data: { name: body.name, provider: body.provider, providerConfigId: body.providerConfigId, accessLevel: body.accessLevel, workspaceId: body.workspaceId ?? 'default', projectId: body.projectId, model: body.model, systemPrompt: body.systemPrompt ?? '' } }), { status: 201 })
}
