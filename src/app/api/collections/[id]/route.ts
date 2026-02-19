import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { project_id } = await req.json()

  const collection = await prisma.collection.findUnique({ where: { id } })
  if (!collection) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  const updated = await prisma.collection.update({
    where: { id },
    data: { projectId: project_id ?? null },
  })

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    project_id: updated.projectId,
    created_at: updated.createdAt.toISOString(),
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const collection = await prisma.collection.findUnique({ where: { id } })
  if (!collection) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  // Move all scripts to unsorted (null collection)
  await prisma.script.updateMany({
    where: { collectionId: id },
    data: { collectionId: null }
  })

  await prisma.collection.delete({ where: { id } })

  return NextResponse.json({ message: 'Collection deleted' })
}
