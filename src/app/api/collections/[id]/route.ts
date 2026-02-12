import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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
