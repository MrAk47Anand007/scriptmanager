import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncCollection } from '@/lib/storage/syncService'
import { getScriptsRootDir } from '@/lib/scriptRunner'
import { cache } from '@/lib/cache'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const root = await getScriptsRootDir()
  const summary = await syncCollection(prisma, id, root)
  if (summary.pulled > 0) {
    await cache.del('all_scripts')
  }
  return NextResponse.json(summary, { status: summary.ok ? 200 : 400 })
}
