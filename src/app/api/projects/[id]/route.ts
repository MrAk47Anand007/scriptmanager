import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { DEFAULT_WORKSPACE_POLICY } from '@/lib/git/types'

const projectJson = (project: any) => ({ id: project.id, name: project.name, description: project.description,
  environment: project.environment, color: project.color, repository_root: project.repositoryRoot,
  default_branch: project.defaultBranch, remote_url: project.remoteUrl,
  workspace_policy: JSON.parse(project.workspacePolicy || '{}'), collection_ids: project.collections.map((c: { id: string }) => c.id),
  created_at: project.createdAt.toISOString(), updated_at: project.updatedAt.toISOString() })

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: { collections: { select: { id: true } } }
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  return NextResponse.json(projectJson(project))
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { name, description, environment, color, repository_root, default_branch, remote_url, workspace_policy } = await req.json()

  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const validEnvironments = ['development', 'qa', 'uat', 'production']

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description }),
      ...(environment !== undefined && validEnvironments.includes(environment) && { environment }),
      ...(color !== undefined && { color }),
      ...(repository_root !== undefined && { repositoryRoot: repository_root?.trim() || null }),
      ...(default_branch !== undefined && { defaultBranch: default_branch?.trim() || 'main' }),
      ...(remote_url !== undefined && { remoteUrl: remote_url?.trim() || null }),
      ...(workspace_policy !== undefined && { workspacePolicy: JSON.stringify({ ...DEFAULT_WORKSPACE_POLICY, ...workspace_policy }) }),
    },
    include: { collections: { select: { id: true } } }
  })

  return NextResponse.json(projectJson(updated))
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Collections have onDelete: SetNull so they become unassigned automatically
  await prisma.project.delete({ where: { id } })

  return NextResponse.json({ message: 'Project deleted' })
}
