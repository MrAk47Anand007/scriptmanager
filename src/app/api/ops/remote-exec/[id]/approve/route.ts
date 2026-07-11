import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { execRemote } from '@/lib/sshService'
import { buildRemoteCommand } from '@/lib/executionSafety'
import { executionTelemetry } from '@/lib/execution'

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const correlationId = executionTelemetry.correlationId(req)
    const { approver_name } = await req.json()

    if (!approver_name?.trim()) {
        return NextResponse.json({ error: 'approver_name is required' }, { status: 400 })
    }

    const execution = await prisma.remoteExecution.findUnique({ where: { id } })
    if (!execution) {
        return NextResponse.json({ error: 'Remote execution not found' }, { status: 404 })
    }
    if (execution.status !== 'pending_approval') {
        return NextResponse.json(
            { error: `Cannot approve execution with status: ${execution.status}` },
            { status: 400 }
        )
    }

    await prisma.remoteExecution.update({
        where: { id },
        data: {
            status: 'approved',
            approvedBy: approver_name.trim(),
            approvedAt: new Date(),
        },
    })

    const script = await prisma.script.findUnique({ where: { id: execution.scriptId } })
    if (!script) {
        return NextResponse.json({ error: 'Script not found' }, { status: 404 })
    }

    const paramValues = execution.paramValues ? JSON.parse(execution.paramValues) : {}
    const command = buildRemoteCommand(script.filename, execution.remotePath ?? undefined, paramValues as Record<string, string>)

    // Fire-and-forget
    execRemote({
        profileId: execution.profileId, command, remoteExecId: id,
        context: { correlationId, actor: { type: 'user', id: approver_name.trim() }, trigger: 'remote' },
    }).catch(console.error)

    return NextResponse.json({ ok: true, remote_exec_id: id }, {
        headers: { 'x-correlation-id': correlationId },
    })
}
