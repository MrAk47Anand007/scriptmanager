import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createGithubGistCredentialService } from '@/lib/gistCredentials'
import { createSecretVaultService } from '@/lib/secrets/service'
import { createServerSecretStore } from '@/lib/secrets/serverStore'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

function credentials() {
  return createGithubGistCredentialService(prisma, createSecretVaultService(prisma, createServerSecretStore()))
}

async function readSyncEnabled() {
  const setting = await prisma.setting.findUnique({ where: { key: 'gist_sync_enabled' } })
  return setting?.value === 'true'
}

async function response(workspaceId: string) {
  const status = await credentials().getStatus(workspaceId)
  return NextResponse.json({ configured: status.configured, syncEnabled: await readSyncEnabled() })
}

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, 'session', 'read')
  if (authorization.response) return authorization.response
  return response(authorization.context.workspaceId)
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, 'session', 'manage')
  if (authorization.response) return authorization.response
  const actor = authorization.context
  const payload = await request.json() as { token?: unknown; syncEnabled?: unknown }
  if (typeof payload.syncEnabled !== 'boolean') {
    return NextResponse.json({ error: 'syncEnabled must be a boolean' }, { status: 400 })
  }
  if (payload.token !== undefined && typeof payload.token !== 'string') {
    return NextResponse.json({ error: 'token must be a string' }, { status: 400 })
  }

  const vaultCredentials = credentials()
  if (typeof payload.token === 'string' && payload.token.trim()) {
    await vaultCredentials.saveToken(payload.token, { workspaceId: actor.workspaceId, actorId: actor.userId })
  }
  await prisma.setting.upsert({
    where: { key: 'gist_sync_enabled' },
    update: { value: String(payload.syncEnabled) },
    create: { key: 'gist_sync_enabled', value: String(payload.syncEnabled) },
  })
  return response(actor.workspaceId)
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request, 'session', 'manage')
  if (authorization.response) return authorization.response
  const actor = authorization.context
  const status = await credentials().clearToken({ workspaceId: actor.workspaceId, actorId: actor.userId })
  await prisma.setting.deleteMany({ where: { key: 'gist_sync_enabled' } })
  return NextResponse.json({ ...status, syncEnabled: false })
}
