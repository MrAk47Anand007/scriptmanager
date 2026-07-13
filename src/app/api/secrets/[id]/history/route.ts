import { NextResponse } from 'next/server'
import { defaultSecretVaultService } from '@/lib/secrets/defaultService'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return NextResponse.json(await defaultSecretVaultService().accessHistory((await params).id))
}
