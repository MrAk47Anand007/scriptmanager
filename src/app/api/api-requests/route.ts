import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const collectionId = searchParams.get('collectionId')

  const requests = await prisma.apiRequest.findMany({
    where: collectionId ? { collectionId } : undefined,
    orderBy: { updatedAt: 'desc' }
  })

  return NextResponse.json(requests.map(r => ({
    id: r.id,
    name: r.name,
    method: r.method,
    url: r.url,
    headers: r.headers,
    query_params: r.queryParams,
    body_type: r.bodyType,
    body: r.body,
    auth_type: r.authType,
    auth_config: r.authConfig,
    collection_id: r.collectionId ?? null,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString()
  })))
}

export async function POST(req: Request) {
  const { name, method, url, headers, query_params, body_type, body, auth_type, auth_config, collection_id } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const request = await prisma.apiRequest.create({
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
