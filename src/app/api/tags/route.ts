import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/tags — list all tags
export async function GET() {
  const tags = await prisma.tag.findMany({
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
  const body = await req.json()
  const name = (body.name ?? '').trim().toLowerCase()
  const color = body.color ?? '#6366f1'

  if (!name) {
    return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })
  }

  const existing = await prisma.tag.findUnique({ where: { name } })
  if (existing) {
    return NextResponse.json(
      { id: existing.id, name: existing.name, color: existing.color, created_at: existing.createdAt.toISOString() },
      { status: 200 }
    )
  }

  const tag = await prisma.tag.create({ data: { name, color } })
  return NextResponse.json(
    { id: tag.id, name: tag.name, color: tag.color, created_at: tag.createdAt.toISOString() },
    { status: 201 }
  )
}
