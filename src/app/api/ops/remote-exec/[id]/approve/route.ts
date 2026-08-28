import { NextResponse } from 'next/server'
import { executionTelemetry } from '@/lib/execution'
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext'
import { requireTrustedContext } from '@/lib/runtime/trustedContext'
import { prisma } from '@/lib/db'
import { approveRemoteExecution } from '@/lib/ops/remoteExecutionApprovalService'

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const actor = requireTrustedContext(await resolveTrustedRequestContext(req, prisma))
        const { id } = await params
        const correlationId = executionTelemetry.correlationId(req)
        const result = await approveRemoteExecution(id, actor, correlationId)
        return NextResponse.json({ ok: result.ok, remote_exec_id: result.remoteExecId }, {
            headers: { 'x-correlation-id': correlationId },
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const status = message.includes('Unauthorized') ? 401 : message.includes('not found') ? 404 : message.includes('match') || message.includes('Cannot') ? 403 : 409
        return NextResponse.json({ error: message }, { status })
    }
}
