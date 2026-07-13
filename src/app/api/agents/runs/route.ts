import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { randomUUID } from 'node:crypto'

export async function GET(request: Request) { return NextResponse.json(await prisma.agentRun.findMany({ where: { workspaceId: request.headers.get('x-scriptmanager-workspace-id') ?? new URL(request.url).searchParams.get('workspaceId') ?? 'default' }, include: { profile: true }, orderBy: { createdAt: 'desc' } })) }
export async function POST(request: Request) {
  if (request.headers.get('x-scriptmanager-desktop') !== '1') return NextResponse.json({ error: 'Local agent providers require ScriptManager Desktop', desktopHostRequired: true }, { status: 409 })
  const workspaceId = request.headers.get('x-scriptmanager-workspace-id') ?? 'default'
  const body = await request.json(); const profile = await prisma.agentProfile.findFirst({ where: { id: body.profileId, workspaceId } })
  if (!profile || !body.prompt || !body.cwd) return NextResponse.json({ error: 'profileId, prompt, and cwd are required' }, { status: 400 })
  const run = await prisma.agentRun.create({ data: { profileId: profile.id, provider: profile.provider, workspaceId: profile.workspaceId, initiatedBy: request.headers.get('x-scriptmanager-user-id') ?? 'local-admin', correlationId: randomUUID(), inputJson: JSON.stringify({ prompt: body.prompt }), status: 'running', startedAt: new Date() } })
  await prisma.agentMessage.create({ data: { runId: run.id, role: 'user', content: body.prompt } })
  return NextResponse.json({ ...run, providerSessionId: run.id, cwd: body.cwd }, { status: 201 })
}
