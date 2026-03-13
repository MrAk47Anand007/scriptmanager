import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const environments = await prisma.apiEnvironment.findMany({
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(environments.map((environment) => ({
    id: environment.id,
    name: environment.name,
    variables: environment.variables,
    created_at: environment.createdAt.toISOString(),
    updated_at: environment.updatedAt.toISOString(),
  })))
}

export async function POST(req: Request) {
  const { name, variables } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const environment = await prisma.apiEnvironment.create({
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
