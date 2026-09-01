import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { randomUUID } from 'node:crypto'
import { vaultNotificationConfig } from '@/lib/secrets/notificationConfig'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, 'notification', 'read')
  if (authorization.response) return authorization.response
  return NextResponse.json(await prisma.notificationChannel.findMany({ where: { workspaceId: authorization.context.workspaceId }, include: { _count: { select: { rules: true, deliveries: true } } }, orderBy: { createdAt: 'desc' } }))
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, 'notification', 'create')
  if (authorization.response) return authorization.response
  const body = await request.json() as { name: string; kind: string; config?: unknown }
  if (!['desktop', 'webhook', 'slack', 'smtp', 'teams'].includes(body.kind)) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const id = randomUUID()
  const config = await vaultNotificationConfig(prisma, id, body.config, { workspaceId: authorization.context.workspaceId, actorId: authorization.context.userId })
  return NextResponse.json(await prisma.notificationChannel.create({ data: { id, workspaceId: authorization.context.workspaceId, name: body.name.trim(), kind: body.kind, configJson: JSON.stringify(config) } }), { status: 201 })
}
