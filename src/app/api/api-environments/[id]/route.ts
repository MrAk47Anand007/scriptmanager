import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(req, 'api', 'update')
  if (authorization.response) return authorization.response
  const { id } = await params
  const { name, variables } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const existing = await prisma.apiEnvironment.findFirst({ where: { id, workspaceId: authorization.context.workspaceId } })
  if (!existing) return NextResponse.json({ error: 'Environment not found' }, { status: 404 })
  const environment = await prisma.apiEnvironment.update({
    where: { id: existing.id },
    data: {
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

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(_req, 'api', 'delete')
  if (authorization.response) return authorization.response
  const { id } = await params

  const deleted = await prisma.apiEnvironment.deleteMany({ where: { id, workspaceId: authorization.context.workspaceId } })
  if (deleted.count === 0) return NextResponse.json({ error: 'Environment not found' }, { status: 404 })

  return NextResponse.json({ success: true })
}
