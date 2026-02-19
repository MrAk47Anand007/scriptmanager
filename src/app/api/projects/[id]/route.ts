import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: { collections: { select: { id: true } } }
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: project.id,
    name: project.name,
    description: project.description,
    environment: project.environment,
    color: project.color,
    collection_ids: project.collections.map(c => c.id),
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { name, description, environment, color } = await req.json()

  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const validEnvironments = ['development', 'qa', 'uat', 'production']

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description }),
      ...(environment !== undefined && validEnvironments.includes(environment) && { environment }),
      ...(color !== undefined && { color }),
    },
    include: { collections: { select: { id: true } } }
  })

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    environment: updated.environment,
    color: updated.color,
    collection_ids: updated.collections.map(c => c.id),
    created_at: updated.createdAt.toISOString(),
    updated_at: updated.updatedAt.toISOString(),
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Collections have onDelete: SetNull so they become unassigned automatically
  await prisma.project.delete({ where: { id } })

  return NextResponse.json({ message: 'Project deleted' })
}
