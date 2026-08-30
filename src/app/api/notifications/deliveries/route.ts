import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, 'notification', 'read')
  if (authorization.response) return authorization.response
  return NextResponse.json(await prisma.notificationDelivery.findMany({ where: { workspaceId: authorization.context.workspaceId }, include: { channel: true, rule: true }, orderBy: { createdAt: 'desc' }, take: 100 }))
}
