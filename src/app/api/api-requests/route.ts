import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { randomUUID } from 'node:crypto'
import { vaultApiAuthConfig } from '@/lib/secrets/apiAuth'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(req: Request) {
  const authorization = await authorizeRequest(req, 'api', 'read')
  if (authorization.response) return authorization.response
  const { searchParams } = new URL(req.url)
  const collectionId = searchParams.get('collectionId')

  const requests = await (prisma.apiRequest as any).findMany({
    where: { workspaceId: authorization.context.workspaceId, ...(collectionId ? { collectionId } : {}) },
    orderBy: { updatedAt: 'desc' }
  }) as Array<any>

  return NextResponse.json(requests.map(r => ({
    id: r.id,
    name: r.name,
    method: r.method,
    url: r.url,
    headers: r.headers,
    query_params: r.queryParams,
    variables: r.variables,
    request_options: r.requestOptions,
    pre_request_script: r.preRequestScript,
    test_script: r.testScript,
    response_mappings: r.responseMappings,
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
  const authorization = await authorizeRequest(req, 'api', 'create')
  if (authorization.response) return authorization.response
  const { name, method, url, headers, query_params, variables, request_options, pre_request_script, test_script, response_mappings, body_type, body, auth_type, auth_config, collection_id } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  if (collection_id) {
    const collection = await prisma.apiCollection.findFirst({ where: { id: collection_id, workspaceId: authorization.context.workspaceId } })
    if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  const requestId = randomUUID()
  const request = await (prisma.apiRequest as any).create({
    data: {
      id: requestId,
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
      authConfig: await vaultApiAuthConfig(prisma, requestId, auth_config ?? '{}', { workspaceId: authorization.context.workspaceId, actorId: authorization.context.userId }),
      collectionId: collection_id ?? null,
      workspaceId: authorization.context.workspaceId,
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
