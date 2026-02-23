import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const request = await prisma.apiRequest.findUnique({ where: { id } })

  if (!request) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: request.id,
    name: request.name,
    method: request.method,
    url: request.url,
    headers: request.headers,
    query_params: request.queryParams,
    body_type: request.bodyType,
    body: request.body,
    auth_type: request.authType,
    auth_config: request.authConfig,
    collection_id: request.collectionId ?? null,
    created_at: request.createdAt.toISOString(),
    updated_at: request.updatedAt.toISOString()
  })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { name, method, url, headers, query_params, body_type, body, auth_type, auth_config, collection_id } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const request = await prisma.apiRequest.update({
    where: { id },
    data: {
      name: name.trim(),
      method: method ?? 'GET',
      url: url ?? '',
      headers: headers ?? '[]',
      queryParams: query_params ?? '[]',
      bodyType: body_type ?? 'none',
      body: body ?? '',
      authType: auth_type ?? 'none',
      authConfig: auth_config ?? '{}',
      collectionId: collection_id ?? null
    }
  })

  return NextResponse.json({
    id: request.id,
    name: request.name,
    method: request.method,
    url: request.url,
    headers: request.headers,
    query_params: request.queryParams,
    body_type: request.bodyType,
    body: request.body,
    auth_type: request.authType,
    auth_config: request.authConfig,
    collection_id: request.collectionId ?? null,
    created_at: request.createdAt.toISOString(),
    updated_at: request.updatedAt.toISOString()
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  await prisma.apiRequest.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
