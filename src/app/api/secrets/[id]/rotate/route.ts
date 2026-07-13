import { NextResponse } from 'next/server'
import { defaultSecretVaultService } from '@/lib/secrets/defaultService'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  if (!body.plaintext) return NextResponse.json({ error: 'plaintext is required' }, { status: 400 })
  return NextResponse.json(await defaultSecretVaultService().rotateSecret(id, body.plaintext, { actorType: 'user', actorId: 'current-user', workspaceId: body.workspaceId ?? 'default', capability: 'secret:write', resource: body.resource ?? '*', reason: body.reason ?? 'manual rotation' }))
}
