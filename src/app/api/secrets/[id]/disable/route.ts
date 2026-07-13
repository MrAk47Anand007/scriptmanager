import { NextResponse } from 'next/server'
import { defaultSecretVaultService } from '@/lib/secrets/defaultService'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return NextResponse.json(await defaultSecretVaultService().disableSecret(id, { actorType: 'user', actorId: 'current-user', workspaceId: body.workspaceId ?? 'default', capability: 'secret:write', resource: body.resource ?? '*', reason: body.reason ?? 'manual disable' }))
}
