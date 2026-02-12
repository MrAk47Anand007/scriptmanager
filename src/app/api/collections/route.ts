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
    created_at: c.createdAt.toISOString()
  })))
}

export async function POST(req: Request) {
  const { name, description } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const collection = await prisma.collection.create({
    data: { name: name.trim(), description: description ?? '' }
  })

  return NextResponse.json({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    script_count: 0,
    created_at: collection.createdAt.toISOString()
  })
}
