import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { listStorageProviders, saveStorageProvider, type SaveStorageProviderPayload } from '@/lib/storage/providerStore'

export async function GET() {
  const providers = await listStorageProviders(prisma)
  return NextResponse.json(providers)
}

export async function POST(req: Request) {
  const data = (await req.json()) as SaveStorageProviderPayload

  if (!data.name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (!data.type) {
    return NextResponse.json({ error: 'Type is required' }, { status: 400 })
  }

  try {
    const provider = await saveStorageProvider(prisma, data)
    return NextResponse.json(provider)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save storage provider' },
      { status: 500 }
    )
  }
}
