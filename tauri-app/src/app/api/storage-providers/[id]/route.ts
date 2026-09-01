import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteStorageProvider } from '@/lib/storage/providerStore'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'ops', 'delete')
  if (authorization.response) return authorization.response
  const { id } = await params

  try {
    const result = await deleteStorageProvider(prisma, id, authorization.context.workspaceId)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete storage provider' },
      { status: error instanceof Error && error.message === 'Storage provider not found' ? 404 : 500 }
    )
  }
}
