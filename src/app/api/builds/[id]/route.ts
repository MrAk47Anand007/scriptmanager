import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/builds/[id] — list all builds for a script (id = scriptId)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: scriptId } = await params

  const builds = await prisma.build.findMany({
    where: { scriptId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(
    builds.map(b => ({
      id: b.id,
      script_id: b.scriptId,
      status: b.status,
      triggered_by: b.triggeredBy,
      started_at: b.startedAt?.toISOString() ?? b.createdAt.toISOString(),
      completed_at: b.finishedAt?.toISOString() ?? null,
      exit_code: b.exitCode,
    }))
  )
}
