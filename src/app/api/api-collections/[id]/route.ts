import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { name, description, variables } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const collection = await prisma.apiCollection.update({
    where: { id },
    data: { name: name.trim(), description: description ?? '', variables: variables ?? '[]' }
  })

  return NextResponse.json({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    variables: collection.variables,
    updated_at: collection.updatedAt.toISOString()
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  await prisma.apiCollection.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
