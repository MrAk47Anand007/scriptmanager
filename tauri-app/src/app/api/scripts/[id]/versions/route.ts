import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

// GET /api/scripts/[id]/versions — list version snapshots (no content, just metadata)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(req, 'script', 'read')
  if (authorization.response) return authorization.response
  const { id } = await params
  const script = await prisma.script.findFirst({ where: { id, workspaceId: authorization.context.workspaceId }, select: { id: true } })
  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })

  const versions = await prisma.scriptVersion.findMany({
    where: { scriptId: id },
    orderBy: { snapshotNumber: 'desc' },
    select: {
      id: true,
      snapshotNumber: true,
      savedAt: true,
    }
  })

  return NextResponse.json(
    versions.map(v => ({
      id: v.id,
      snapshot_number: v.snapshotNumber,
      saved_at: v.savedAt.toISOString(),
    }))
  )
}
