import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { defaultSecretVaultService } from '@/lib/secrets/defaultService'
import { parseSecretReference, serializeSecretReference } from '@/lib/secrets/references'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

type Params = Promise<{ id: string }>

// GET /api/scripts/[id]/env — list env vars (values masked for secrets)
export async function GET(
  req: Request,
  { params }: { params: Params }
) {
  const authorization = await authorizeRequest(req, 'script', 'read')
  if (authorization.response) return authorization.response
  const { id: scriptId } = await params

  const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId: authorization.context.workspaceId } })
  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })

  const envVars = await prisma.scriptEnvVar.findMany({
    where: { scriptId },
    orderBy: { key: 'asc' },
  })

  return NextResponse.json(
    envVars.map(v => ({
      id: v.id,
      key: v.key,
      value: v.isSecret ? '' : v.value,
      is_secret: v.isSecret,
    }))
  )
}

// POST /api/scripts/[id]/env — upsert (create or update) an env var
export async function POST(
  req: Request,
  { params }: { params: Params }
) {
  const authorization = await authorizeRequest(req, 'script', 'update')
  if (authorization.response) return authorization.response
  const { id: scriptId } = await params
  const body = await req.json()
  const key = (body.key ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  const value = body.value ?? ''
  const isSecret = !!body.is_secret

  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 })

  const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId: authorization.context.workspaceId } })
  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })

  const existing = await prisma.scriptEnvVar.findUnique({ where: { scriptId_key: { scriptId, key } } })
  let persistedValue = value
  if (isSecret) {
    const service = defaultSecretVaultService()
    const access = { actorType: 'user' as const, actorId: authorization.context.userId, workspaceId: authorization.context.workspaceId, capability: 'secret:write', resource: `script:${scriptId}`, reason: 'script environment update' }
    let secretId: string
    if (existing?.isSecret && existing.value.startsWith('secretref:')) {
      secretId = parseSecretReference(existing.value)
      await service.rotateSecret(secretId, value, access)
    } else {
      const secret = await service.createSecret({ name: `script:${scriptId}:${key}`, plaintext: value, description: `Environment variable ${key}`, scope: 'resource', workspaceId: authorization.context.workspaceId, createdBy: access.actorId })
      secretId = secret.id
    }
    await service.bindSecret(secretId, { resourceType: 'script', resourceId: scriptId, field: key, workspaceId: authorization.context.workspaceId, createdBy: access.actorId })
    persistedValue = serializeSecretReference(secretId)
  }

  const envVar = await prisma.scriptEnvVar.upsert({
    where: { scriptId_key: { scriptId, key } },
    update: { value: persistedValue, isSecret },
    create: { scriptId, key, value: persistedValue, isSecret },
  })

  return NextResponse.json({
    id: envVar.id,
    key: envVar.key,
    value: envVar.isSecret ? '' : envVar.value,
    is_secret: envVar.isSecret,
  })
}

// DELETE /api/scripts/[id]/env?key=... — remove an env var
export async function DELETE(
  req: Request,
  { params }: { params: Params }
) {
  const authorization = await authorizeRequest(req, 'script', 'update')
  if (authorization.response) return authorization.response
  const { id: scriptId } = await params
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')

  if (!key) return NextResponse.json({ error: 'key query param required' }, { status: 400 })

  const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId: authorization.context.workspaceId }, select: { id: true } })
  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  await prisma.scriptEnvVar.deleteMany({ where: { scriptId, key } })
  return NextResponse.json({ message: 'Env var deleted' })
}
