import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateApiToken, hashApiToken } from '@/lib/auth'
import { cache } from '@/lib/cache'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, 'session', 'manage')
  if (authorization.response) return authorization.response
  const stored = await prisma.setting.findUnique({ where: { key: 'api_token_hash' } })
  return NextResponse.json({ has_token: !!stored?.value })
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, 'session', 'manage')
  if (authorization.response) return authorization.response
  const token = generateApiToken()
  const tokenHash = hashApiToken(token)

  await prisma.setting.upsert({
    where: { key: 'api_token_hash' },
    update: { value: tokenHash },
    create: { key: 'api_token_hash', value: tokenHash },
  })

  await cache.del('settings')

  return NextResponse.json({ token })
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request, 'session', 'manage')
  if (authorization.response) return authorization.response
  await prisma.setting.deleteMany({ where: { key: 'api_token_hash' } })
  await cache.del('settings')
  return NextResponse.json({ ok: true })
}
