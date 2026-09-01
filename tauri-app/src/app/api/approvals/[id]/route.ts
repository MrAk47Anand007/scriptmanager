import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authorization = await authorizeRequest(request, 'approval', 'read')
    if (authorization.response) return authorization.response
    const item = await createApprovalService(prisma).get((await params).id, authorization.context.workspaceId)
    return item ? NextResponse.json(item) : NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 403 })
  }
}
