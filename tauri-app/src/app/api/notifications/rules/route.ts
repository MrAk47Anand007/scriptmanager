import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, 'notification', 'read')
  if (authorization.response) return authorization.response
  return NextResponse.json(await prisma.notificationRule.findMany({ where: { workspaceId: authorization.context.workspaceId }, include: { channel: true }, orderBy: { createdAt: 'desc' } }))
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, 'notification', 'create')
  if (authorization.response) return authorization.response
  const body = await request.json() as { channelId: string; name: string; eventTypes: string; filter?: unknown; template?: unknown; throttleSeconds?: number }
  const channel = await prisma.notificationChannel.findFirst({ where: { id: body.channelId, workspaceId: authorization.context.workspaceId }, select: { id: true } })
  if (!channel) return NextResponse.json({ error: 'Notification channel not found' }, { status: 404 })
  if (!body.name?.trim() || !body.eventTypes?.trim()) return NextResponse.json({ error: 'name and eventTypes are required' }, { status: 400 })
  return NextResponse.json(await prisma.notificationRule.create({ data: { channelId: channel.id, workspaceId: authorization.context.workspaceId, name: body.name.trim(), eventTypes: body.eventTypes, filterJson: JSON.stringify(body.filter ?? {}), templateJson: JSON.stringify(body.template ?? {}), throttleSeconds: Math.max(0, Math.min(body.throttleSeconds ?? 0, 86400)) } }), { status: 201 })
}
