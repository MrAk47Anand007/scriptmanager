import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

// GET /api/tags — list all tags
export async function GET(req: Request) {
  const authorization = await authorizeRequest(req, 'script', 'read')
  if (authorization.response) return authorization.response
  const tags = await prisma.tag.findMany({
    where: { workspaceId: authorization.context.workspaceId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { scripts: true } } },
  })
  return NextResponse.json(
    tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      script_count: t._count.scripts,
      created_at: t.createdAt.toISOString(),
    }))
  )
}

// POST /api/tags — create a tag
export async function POST(req: Request) {
  const authorization = await authorizeRequest(req, 'script', 'update')
  if (authorization.response) return authorization.response
  const body = await req.json()
  const workspaceId = authorization.context.workspaceId
  const name = (body.name ?? '').trim().toLowerCase()
  const color = body.color ?? '#6366f1'

  if (!name) {
    return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })
  }

  const existing = await prisma.tag.findUnique({ where: { workspaceId_name: { workspaceId, name } } })
  if (existing) {
    return NextResponse.json(
      { id: existing.id, name: existing.name, color: existing.color, created_at: existing.createdAt.toISOString() },
      { status: 200 }
    )
  }

  const tag = await prisma.tag.create({ data: { workspaceId, name, color } })
  return NextResponse.json(
    { id: tag.id, name: tag.name, color: tag.color, created_at: tag.createdAt.toISOString() },
    { status: 201 }
  )
}
