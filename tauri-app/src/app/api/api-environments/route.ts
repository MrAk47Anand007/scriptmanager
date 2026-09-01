import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(req: Request) {
  const authorization = await authorizeRequest(req, 'api', 'read')
  if (authorization.response) return authorization.response
  const environments = await prisma.apiEnvironment.findMany({
    where: { workspaceId: authorization.context.workspaceId },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(environments.map((environment) => ({
    id: environment.id,
    name: environment.name,
    variables: environment.variables,
    created_at: environment.createdAt.toISOString(),
    updated_at: environment.updatedAt.toISOString(),
  })))
}

export async function POST(req: Request) {
  const authorization = await authorizeRequest(req, 'api', 'create')
  if (authorization.response) return authorization.response
  const { name, variables } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const environment = await prisma.apiEnvironment.create({
    data: {
      workspaceId: authorization.context.workspaceId,
      name: name.trim(),
      variables: variables ?? '[]',
    },
  })

  return NextResponse.json({
    id: environment.id,
    name: environment.name,
    variables: environment.variables,
    created_at: environment.createdAt.toISOString(),
    updated_at: environment.updatedAt.toISOString(),
  })
}
