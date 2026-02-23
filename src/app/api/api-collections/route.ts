import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const collections = await prisma.apiCollection.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { requests: true } } }
  })

  return NextResponse.json(collections.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    request_count: c._count.requests,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString()
  })))
}

export async function POST(req: Request) {
  const { name, description } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const collection = await prisma.apiCollection.create({
    data: { name: name.trim(), description: description ?? '' }
  })

  return NextResponse.json({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    request_count: 0,
    created_at: collection.createdAt.toISOString(),
    updated_at: collection.updatedAt.toISOString()
  })
}
