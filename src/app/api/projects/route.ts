import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { name: 'asc' },
    include: {
      collections: { select: { id: true } }
    }
  })

  return NextResponse.json(projects.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    environment: p.environment,
    color: p.color,
    collection_ids: p.collections.map(c => c.id),
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  })))
}

export async function POST(req: Request) {
  const { name, description, environment, color } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const validEnvironments = ['development', 'qa', 'uat', 'production']
  const env = validEnvironments.includes(environment) ? environment : 'development'

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      description: description ?? '',
      environment: env,
      color: color ?? '#6366f1',
    },
    include: { collections: { select: { id: true } } }
  })

  return NextResponse.json({
    id: project.id,
    name: project.name,
    description: project.description,
    environment: project.environment,
    color: project.color,
    collection_ids: project.collections.map(c => c.id),
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  }, { status: 201 })
}
