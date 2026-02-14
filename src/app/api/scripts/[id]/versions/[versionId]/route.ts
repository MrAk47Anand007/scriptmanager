import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/scripts/[id]/versions/[versionId] — get full content of a specific version
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params

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
