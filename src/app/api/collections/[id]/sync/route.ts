import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncCollection } from '@/lib/storage/syncService'
import { getScriptsRootDir } from '@/lib/scriptRunner'
import { cache } from '@/lib/cache'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'run')
  if (authorization.response) return authorization.response
  const { id } = await params
  const collection = await prisma.collection.findFirst({ where: { id, workspaceId: authorization.context.workspaceId } })
  if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  const root = await getScriptsRootDir()
  const summary = await syncCollection(prisma, id, root, authorization.context.workspaceId)
  if (summary.pulled > 0) {
    await cache.del(`all_scripts:${authorization.context.workspaceId}`)
  }
  return NextResponse.json(summary, { status: summary.ok ? 200 : 400 })
}
