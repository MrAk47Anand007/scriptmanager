import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const runs = await (prisma.apiCollectionRun as any).findMany({
    orderBy: { startedAt: 'desc' },
    take: 50,
  }) as Array<any>

  return NextResponse.json(runs.map((run) => ({
    id: run.id,
    collection_id: run.collectionId,
    collection_name: run.collectionName,
    environment_id: run.environmentId ?? null,
    environment_name: run.environmentName ?? null,
    status: run.status,
    total_requests: run.totalRequests,
    passed_requests: run.passedRequests,
    failed_requests: run.failedRequests,
    results: run.results,
    started_at: run.startedAt.toISOString(),
    finished_at: run.finishedAt ? run.finishedAt.toISOString() : null,
    duration_ms: run.durationMs ?? null,
  })))
}
