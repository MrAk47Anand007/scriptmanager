import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request) {
  try {
    const authorization = await authorizeRequest(request, 'approval', 'read')
    if (authorization.response) return authorization.response
    const status = new URL(request.url).searchParams.get('status') ?? 'pending'
    return NextResponse.json(await createApprovalService(prisma).list(status, authorization.context.workspaceId))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 403 })
  }
}
