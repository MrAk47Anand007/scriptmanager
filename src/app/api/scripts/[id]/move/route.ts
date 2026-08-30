import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'update')
  if (authorization.response) return authorization.response
  const { id } = await params
  const { collection_id } = await req.json()

  const script = await prisma.script.findFirst({ where: { id, workspaceId: authorization.context.workspaceId } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  if (collection_id) {
    const collection = await prisma.collection.findFirst({ where: { id: collection_id, workspaceId: authorization.context.workspaceId } })
    if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  const updated = await prisma.script.update({
    where: { id },
    data: { collectionId: collection_id ?? null }
  })

  return NextResponse.json({ collection_id: updated.collectionId })
}
