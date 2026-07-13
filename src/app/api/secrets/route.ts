import { NextResponse } from 'next/server'
import { defaultSecretVaultService } from '@/lib/secrets/defaultService'

export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get('workspaceId') ?? 'default'
  return NextResponse.json(await defaultSecretVaultService().listSecrets(workspaceId))
}

export async function POST(request: Request) {
  const body = await request.json()
  if (!body.name || !body.plaintext) return NextResponse.json({ error: 'name and plaintext are required' }, { status: 400 })
  const secret = await defaultSecretVaultService().createSecret({ name: body.name, plaintext: body.plaintext, description: body.description, scope: body.scope, workspaceId: body.workspaceId ?? 'default', createdBy: 'current-user' })
  return NextResponse.json(secret, { status: 201 })
}
