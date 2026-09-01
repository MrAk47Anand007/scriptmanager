import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { testStorageProvider } from '@/lib/storage/providerStore'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'ops', 'run')
  if (authorization.response) return authorization.response
  const { id } = await params
  const provider = await prisma.storageProvider.findFirst({ where: { id, workspaceId: authorization.context.workspaceId }, select: { id: true } })
  if (!provider) return NextResponse.json({ error: 'Storage provider not found' }, { status: 404 })
  const result = await testStorageProvider(prisma, id, undefined, authorization.context.workspaceId)
  return NextResponse.json(result)
}
