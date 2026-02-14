import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/scripts/[id]/versions — list version snapshots (no content, just metadata)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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
