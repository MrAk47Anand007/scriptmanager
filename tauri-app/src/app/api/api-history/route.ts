import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(req: Request) {
  const authorization = await authorizeRequest(req, 'api', 'read')
  if (authorization.response) return authorization.response
  const history = await (prisma.apiHistory as any).findMany({
    where: { workspaceId: authorization.context.workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 100
  }) as Array<any>

  return NextResponse.json(history.map(h => ({
    id: h.id,
    request_id: h.requestId ?? null,
    method: h.method,
    url: h.url,
    request_headers: h.requestHeaders,
    request_body: h.requestBody,
    status: h.status,
    status_text: h.statusText,
    duration: h.duration,
    size: h.size,
    response_headers: h.responseHeaders,
    response_body: h.responseBody,
    console_logs: h.consoleLogs,
    test_results: h.testResults,
    created_at: h.createdAt.toISOString()
  })))
}

export async function DELETE(req: Request) {
  const authorization = await authorizeRequest(req, 'api', 'delete')
  if (authorization.response) return authorization.response
  await prisma.apiHistory.deleteMany({ where: { workspaceId: authorization.context.workspaceId } })
  return NextResponse.json({ success: true })
}
