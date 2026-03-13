import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { execRemote } from '@/lib/sshService'
import crypto from 'crypto'
import { buildRemoteCommand } from '@/lib/executionSafety'

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const profileId = searchParams.get('profileId') ?? undefined
    const scriptId = searchParams.get('scriptId') ?? undefined
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)

    const where = {
        ...(profileId ? { profileId } : {}),
        ...(scriptId ? { scriptId } : {}),
    }

    const executions = await prisma.remoteExecution.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        take: limit,
        skip: offset,
    })

    return NextResponse.json(executions.map(e => ({
        id: e.id,
        script_id: e.scriptId,
        profile_id: e.profileId,
        script_name: e.scriptName,
        profile_name: e.profileName,
        server_host: e.serverHost,
        status: e.status,
        triggered_by: e.triggeredBy,
        approved_by: e.approvedBy,
        remote_path: e.remotePath,
        exit_code: e.exitCode,
        param_values: e.paramValues,
        requested_at: e.requestedAt.toISOString(),
        approved_at: e.approvedAt?.toISOString() ?? null,
        started_at: e.startedAt?.toISOString() ?? null,
        finished_at: e.finishedAt?.toISOString() ?? null,
    })))
}

export async function POST(req: Request) {
    const body = await req.json()
    const { profileId, scriptId, paramValues, remotePath } = body

    if (!profileId) return NextResponse.json({ error: 'profileId is required' }, { status: 400 })
    if (!scriptId) return NextResponse.json({ error: 'scriptId is required' }, { status: 400 })

    const profile = await prisma.serverProfile.findUnique({
        where: { id: profileId },
        include: { project: true },
    })
    if (!profile) return NextResponse.json({ error: 'Server profile not found' }, { status: 404 })

    const script = await prisma.script.findUnique({ where: { id: scriptId } })
    if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })

    const remoteExecId = crypto.randomUUID()

    // Approval gate: Production and UAT environments require explicit approval
    const environment = profile.project?.environment ?? 'development'
    const requiresApproval = environment === 'production' || environment === 'uat'

    const status = requiresApproval ? 'pending_approval' : 'approved'

    await prisma.remoteExecution.create({
        data: {
            id: remoteExecId,
            scriptId,
            profileId,
            scriptName: script.name,
            profileName: profile.name,
            serverHost: profile.host,
            status,
            remotePath: remotePath ?? null,
            paramValues: paramValues ? JSON.stringify(paramValues) : '{}',
        },
    })

    if (!requiresApproval) {
        // Fire-and-forget execution (same pattern as executeScriptAsync in scriptRunner.ts)
        const remoteCommand = buildRemoteCommand(script.filename, remotePath, paramValues)
        execRemote({ profileId, command: remoteCommand, remoteExecId }).catch(console.error)
    }

    return NextResponse.json({
        remote_exec_id: remoteExecId,
        requires_approval: requiresApproval,
        environment,
    })
}
