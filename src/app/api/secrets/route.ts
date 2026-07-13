import { NextResponse } from 'next/server'
import { defaultSecretVaultService } from '@/lib/secrets/defaultService'

export async function GET(request: Request) {
  const workspaceId = request.headers.get('x-scriptmanager-workspace-id') ?? new URL(request.url).searchParams.get('workspaceId') ?? 'default'
  return NextResponse.json(await defaultSecretVaultService().listSecrets(workspaceId))
}

export async function POST(request: Request) {
  const body = await request.json()
  const workspaceId = request.headers.get('x-scriptmanager-workspace-id') ?? 'default'
  if (!body.name || !body.plaintext) return NextResponse.json({ error: 'name and plaintext are required' }, { status: 400 })
  const secret = await defaultSecretVaultService().createSecret({ name: body.name, plaintext: body.plaintext, description: body.description, scope: body.scope, workspaceId, createdBy: request.headers.get('x-scriptmanager-user-id') ?? 'current-user' })
  return NextResponse.json(secret, { status: 201 })
}
