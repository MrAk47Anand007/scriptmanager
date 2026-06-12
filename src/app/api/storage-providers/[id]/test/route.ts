import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { testStorageProvider } from '@/lib/storage/providerStore'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await testStorageProvider(prisma, id)
  return NextResponse.json(result)
}
