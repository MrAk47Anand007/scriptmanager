import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteStorageProvider } from '@/lib/storage/providerStore'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const result = await deleteStorageProvider(prisma, id)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete storage provider' },
      { status: 500 }
    )
  }
}
