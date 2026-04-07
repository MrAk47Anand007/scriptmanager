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
    folder_path: c.folderPath ?? null,
    is_temporary: c.isTemporary,
    created_at: c.createdAt.toISOString()
  })))
}

export async function POST(req: Request) {
  const { name, description, project_id, folder_path, is_temporary } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const collection = await prisma.collection.create({
    data: {
      name: name.trim(),
      description: description ?? '',
      projectId: project_id ?? null,
      folderPath: folder_path ?? null,
      isTemporary: !!is_temporary,
    }
  })

  return NextResponse.json({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    script_count: 0,
    project_id: collection.projectId,
    folder_path: collection.folderPath,
    is_temporary: collection.isTemporary,
    created_at: collection.createdAt.toISOString()
  })
}
