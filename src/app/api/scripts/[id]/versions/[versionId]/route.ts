import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

// GET /api/scripts/[id]/versions/[versionId] — get full content of a specific version
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'read')
  if (authorization.response) return authorization.response
  const { id, versionId } = await params

  const script = await prisma.script.findFirst({ where: { id, workspaceId: authorization.context.workspaceId }, select: { id: true } })
  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })

  const version = await prisma.scriptVersion.findFirst({
    where: { id: versionId, scriptId: id },
  })

  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: version.id,
    snapshot_number: version.snapshotNumber,
    content: version.content,
    saved_at: version.savedAt.toISOString(),
  })
}
