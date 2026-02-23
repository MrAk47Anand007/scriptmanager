import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const collections = await prisma.collection.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { scripts: true } } }
  })

  return NextResponse.json(collections.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    script_count: c._count.scripts,
    project_id: c.projectId ?? null,
    created_at: c.createdAt.toISOString()
  })))
}

export async function POST(req: Request) {
  const { name, description, project_id } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const collection = await prisma.collection.create({
    data: {
      name: name.trim(),
      description: description ?? '',
      projectId: project_id ?? null
    }
  })

  return NextResponse.json({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    script_count: 0,
    project_id: collection.projectId,
    created_at: collection.createdAt.toISOString()
  })
}
