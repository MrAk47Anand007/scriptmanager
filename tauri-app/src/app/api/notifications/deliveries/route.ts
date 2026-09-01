import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, 'notification', 'read')
  if (authorization.response) return authorization.response
  const sinceValue = new URL(request.url).searchParams.get('since')
  let since: Date | undefined
  if (sinceValue) {
    since = new Date(sinceValue)
    if (Number.isNaN(since.getTime())) return NextResponse.json({ error: 'Invalid since timestamp' }, { status: 400 })
  }
  return NextResponse.json(await prisma.notificationDelivery.findMany({
    where: {
      workspaceId: authorization.context.workspaceId,
      ...(since ? { createdAt: { gt: since }, status: 'delivered', channel: { kind: 'desktop' } } : {}),
    },
    include: { channel: true, rule: true },
    orderBy: { createdAt: since ? 'asc' : 'desc' },
    take: 100,
  }))
}
