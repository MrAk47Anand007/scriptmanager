import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { listStorageProviders, saveStorageProvider, type SaveStorageProviderPayload } from '@/lib/storage/providerStore'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(req: Request) {
  const authorization = await authorizeRequest(req, 'ops', 'read')
  if (authorization.response) return authorization.response
  const providers = await listStorageProviders(prisma, authorization.context.workspaceId)
  return NextResponse.json(providers)
}

export async function POST(req: Request) {
  const authorization = await authorizeRequest(req, 'ops', 'create')
  if (authorization.response) return authorization.response
  const data = (await req.json()) as SaveStorageProviderPayload

  if (!data.name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (!data.type) {
    return NextResponse.json({ error: 'Type is required' }, { status: 400 })
  }

  try {
    const provider = await saveStorageProvider(prisma, { ...data, workspaceId: authorization.context.workspaceId, actorId: authorization.context.userId }, undefined, authorization.context)
    return NextResponse.json(provider, { status: data.id ? 200 : 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save storage provider' },
      { status: error instanceof Error && error.message === 'Storage provider not found' ? 404 : 500 }
    )
  }
}
