import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext'
import { requireTrustedContext } from '@/lib/runtime/trustedContext'

export async function GET(request: Request) {
  try {
    requireTrustedContext(await resolveTrustedRequestContext(request, prisma))
    const status = new URL(request.url).searchParams.get('status') ?? 'pending'
    return NextResponse.json(await createApprovalService(prisma).list(status))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 403 })
  }
}
