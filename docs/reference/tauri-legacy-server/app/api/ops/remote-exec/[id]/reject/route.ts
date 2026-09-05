import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext'
import { requireTrustedContext } from '@/lib/runtime/trustedContext'
import { rejectRemoteExecution } from '@/lib/ops/remoteExecutionApprovalService'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authorization = await authorizeRequest(req, 'approval', 'approve')
        if (authorization.response) return authorization.response
        const actor = requireTrustedContext(await resolveTrustedRequestContext(req, prisma))
        const { id } = await params
        const result = await rejectRemoteExecution(id, actor)
        return NextResponse.json({ ok: result.ok, remote_exec_id: result.remoteExecId })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const status = message.includes('Unauthorized') ? 401 : message.includes('not found') ? 404 : message.includes('match') || message.includes('Cannot') ? 403 : 409
        return NextResponse.json({ error: message }, { status })
    }
}
