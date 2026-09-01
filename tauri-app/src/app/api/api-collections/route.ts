import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(req: Request) {
  const authorization = await authorizeRequest(req, 'api', 'read')
  if (authorization.response) return authorization.response
  const collections = await prisma.apiCollection.findMany({
    where: { workspaceId: authorization.context.workspaceId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { requests: true } } }
  })

  return NextResponse.json(collections.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    variables: c.variables,
    request_count: c._count.requests,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString()
  })))
}

export async function POST(req: Request) {
  const authorization = await authorizeRequest(req, 'api', 'create')
  if (authorization.response) return authorization.response
  const { name, description, variables } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const collection = await prisma.apiCollection.create({
    data: { workspaceId: authorization.context.workspaceId, name: name.trim(), description: description ?? '', variables: variables ?? '[]' }
  })

  return NextResponse.json({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    variables: collection.variables,
    request_count: 0,
    created_at: collection.createdAt.toISOString(),
    updated_at: collection.updatedAt.toISOString()
  })
}
