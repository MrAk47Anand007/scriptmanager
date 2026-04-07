import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import fs from 'fs'
import { getScriptFilePath } from '@/lib/scriptRunner'
import { cache } from '@/lib/cache'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { name, project_id, folder_path, is_temporary } = await req.json()

  const collection = await prisma.collection.findUnique({ where: { id } })
  if (!collection) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  const updated = await prisma.collection.update({
    where: { id },
    data: {
      name: name?.trim() ? name.trim() : collection.name,
      projectId: project_id ?? null,
      folderPath: folder_path !== undefined ? (folder_path || null) : collection.folderPath,
      isTemporary: is_temporary !== undefined ? !!is_temporary : collection.isTemporary,
    },
  })

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    project_id: updated.projectId,
    folder_path: updated.folderPath,
    is_temporary: updated.isTemporary,
    created_at: updated.createdAt.toISOString(),
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const hardDelete = searchParams.get('hardDelete') === 'true'

  const collection = await prisma.collection.findUnique({ where: { id } })
  if (!collection) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  if (hardDelete) {
    const scripts = await prisma.script.findMany({
      where: { collectionId: id },
      select: { id: true, filename: true, sourcePath: true },
    })

    for (const script of scripts) {
      if (!script.sourcePath) {
        const filePath = await getScriptFilePath(script.filename)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      }
    }

    await prisma.script.deleteMany({ where: { collectionId: id } })
    await prisma.collection.delete({ where: { id } })
    await cache.del('all_scripts')
    return NextResponse.json({ message: 'Collection removed', deleted_script_ids: scripts.map((script) => script.id) })
  }

  // Move all scripts to unsorted (null collection)
  await prisma.script.updateMany({
    where: { collectionId: id },
    data: { collectionId: null }
  })

  await prisma.collection.delete({ where: { id } })
  await cache.del('all_scripts')

  return NextResponse.json({ message: 'Collection deleted' })
}
