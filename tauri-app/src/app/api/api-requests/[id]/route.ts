import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { vaultApiAuthConfig } from '@/lib/secrets/apiAuth'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(_req, 'api', 'read')
  if (authorization.response) return authorization.response
  const { id } = await params

  const request = await (prisma.apiRequest as any).findFirst({ where: { id, workspaceId: authorization.context.workspaceId } }) as any

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
    variables: request.variables,
    request_options: request.requestOptions,
    pre_request_script: request.preRequestScript,
    test_script: request.testScript,
    response_mappings: request.responseMappings,
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
  const authorization = await authorizeRequest(req, 'api', 'update')
  if (authorization.response) return authorization.response
  const { id } = await params
  const { name, method, url, headers, query_params, variables, request_options, pre_request_script, test_script, response_mappings, body_type, body, auth_type, auth_config, collection_id } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const existing = await (prisma.apiRequest as any).findFirst({ where: { id, workspaceId: authorization.context.workspaceId } }) as any
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (collection_id) {
    const collection = await prisma.apiCollection.findFirst({ where: { id: collection_id, workspaceId: authorization.context.workspaceId } })
    if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  const request = await (prisma.apiRequest as any).update({
    where: { id: existing.id },
    data: {
      name: name.trim(),
      method: method ?? 'GET',
      url: url ?? '',
      headers: headers ?? '[]',
      queryParams: query_params ?? '[]',
      variables: variables ?? '[]',
      requestOptions: request_options ?? '{}',
      preRequestScript: pre_request_script ?? '',
      testScript: test_script ?? '',
      responseMappings: response_mappings ?? '[]',
      bodyType: body_type ?? 'none',
      body: body ?? '',
      authType: auth_type ?? 'none',
      authConfig: await vaultApiAuthConfig(prisma, id, auth_config ?? '{}', { workspaceId: authorization.context.workspaceId, actorId: authorization.context.userId }),
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
    variables: request.variables,
    request_options: request.requestOptions,
    pre_request_script: request.preRequestScript,
    test_script: request.testScript,
    response_mappings: request.responseMappings,
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
  const authorization = await authorizeRequest(_req, 'api', 'delete')
  if (authorization.response) return authorization.response
  const { id } = await params

  const deleted = await prisma.apiRequest.deleteMany({ where: { id, workspaceId: authorization.context.workspaceId } })
  if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ success: true })
}
