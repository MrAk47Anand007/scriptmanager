import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { collection_id } = await req.json()

  const script = await prisma.script.findUnique({ where: { id } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const updated = await prisma.script.update({
    where: { id },
    data: { collectionId: collection_id ?? null }
  })

  return NextResponse.json({ collection_id: updated.collectionId })
}
