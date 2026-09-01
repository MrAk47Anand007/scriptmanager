import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
import type { ApprovalDecisionKind } from '@/lib/approvals/types'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext'
import { requireTrustedContext } from '@/lib/runtime/trustedContext'
const decisions=new Set(['allow_once','allow_run','allow_workspace','reject'])
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const authorization = await authorizeRequest(request, 'approval', 'approve')
    if (authorization.response) return authorization.response
    const actor = requireTrustedContext(await resolveTrustedRequestContext(request, prisma))
    const body = await request.json() as { decision: ApprovalDecisionKind; note?: string }
    if (!decisions.has(body.decision)) return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
    return NextResponse.json(await createApprovalService(prisma).decide({ requestId: (await params).id, decision: body.decision, actor, note: body.note }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('Unauthorized') ? 401 : message.includes('match') || message.includes('denied') ? 403 : 409
    return NextResponse.json({ error: message }, { status })
  }
}
