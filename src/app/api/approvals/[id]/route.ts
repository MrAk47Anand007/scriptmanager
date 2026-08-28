import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext'
import { requireTrustedContext } from '@/lib/runtime/trustedContext'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedContext(await resolveTrustedRequestContext(request, prisma))
    const item = await createApprovalService(prisma).get((await params).id)
    return item ? NextResponse.json(item) : NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 403 })
  }
}
