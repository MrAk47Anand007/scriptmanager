import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { name, variables } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const environment = await prisma.apiEnvironment.update({
    where: { id },
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
  const { id } = await params

  await prisma.apiEnvironment.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
