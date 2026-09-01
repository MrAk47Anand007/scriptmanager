import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseWorkspacePolicy } from '@/lib/git/policy'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

const projectJson = (p: any) => ({
  id: p.id, name: p.name, description: p.description, environment: p.environment, color: p.color,
  repository_root: p.repositoryRoot, default_branch: p.defaultBranch, remote_url: p.remoteUrl,
  workspace_policy: parseWorkspacePolicy(p.workspacePolicy), collection_ids: p.collections.map((c: { id: string }) => c.id),
  created_at: p.createdAt.toISOString(), updated_at: p.updatedAt.toISOString(),
})

export async function GET(req: Request) {
  const authorization = await authorizeRequest(req, 'git', 'read')
  if (authorization.response) return authorization.response
  const workspaceId = authorization.context.workspaceId
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
    include: {
      collections: { select: { id: true } }
    }
  })

  return NextResponse.json(projects.map(projectJson))
}

export async function POST(req: Request) {
  const authorization = await authorizeRequest(req, 'git', 'create')
  if (authorization.response) return authorization.response
  const workspaceId = authorization.context.workspaceId
  const { name, description, environment, color, repository_root, default_branch, remote_url, workspace_policy } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const validEnvironments = ['development', 'qa', 'uat', 'production']
  const env = validEnvironments.includes(environment) ? environment : 'development'

  const project = await prisma.project.create({
    data: {
      workspaceId,
      name: name.trim(),
      description: description ?? '',
      environment: env,
      color: color ?? '#6366f1',
      repositoryRoot: repository_root?.trim() || null,
      defaultBranch: default_branch?.trim() || 'main',
      remoteUrl: remote_url?.trim() || null,
      workspacePolicy: JSON.stringify(parseWorkspacePolicy(workspace_policy === undefined ? undefined : JSON.stringify(workspace_policy))),
    },
    include: { collections: { select: { id: true } } }
  })

  return NextResponse.json(projectJson(project), { status: 201 })
}
