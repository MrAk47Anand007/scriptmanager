import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiGlobalsSettingKey, LEGACY_API_GLOBALS_KEY } from '@/lib/apiWorkspace'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(req: Request) {
  const authorization = await authorizeRequest(req, 'api', 'read')
  if (authorization.response) return authorization.response
  const scopedKey = apiGlobalsSettingKey(authorization.context.workspaceId)
  const setting = await prisma.setting.findUnique({ where: { key: scopedKey } })
    ?? (authorization.context.workspaceId === 'default' ? await prisma.setting.findUnique({ where: { key: LEGACY_API_GLOBALS_KEY } }) : null)

  return NextResponse.json({
    variables: setting?.value ?? '[]',
  })
}

export async function PUT(req: Request) {
  const authorization = await authorizeRequest(req, 'api', 'update')
  if (authorization.response) return authorization.response
  const { variables } = await req.json()
  const key = apiGlobalsSettingKey(authorization.context.workspaceId)

  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value: variables ?? '[]' },
    create: { key, value: variables ?? '[]' },
  })

  return NextResponse.json({
    variables: setting.value ?? '[]',
  })
}
