import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(req: Request) {
    const authorization = await authorizeRequest(req, 'ops', 'read')
    if (authorization.response) return authorization.response
    const { searchParams } = new URL(req.url)
    const profileId = searchParams.get('profileId') ?? undefined
    const scriptId = searchParams.get('scriptId') ?? undefined
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)

    const where = {
        profile: { workspaceId: authorization.context.workspaceId },
        ...(profileId ? { profileId } : {}),
        ...(scriptId ? { scriptId } : {}),
    }

    const [executions, total] = await Promise.all([
        prisma.remoteExecution.findMany({
            where,
            orderBy: { requestedAt: 'desc' },
            take: limit,
            skip: offset,
        }),
        prisma.remoteExecution.count({ where }),
    ])

    return NextResponse.json({
        total,
        executions: executions.map(e => ({
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
            log_output: e.logOutput,
            param_values: e.paramValues,
            requested_at: e.requestedAt.toISOString(),
            approved_at: e.approvedAt?.toISOString() ?? null,
            started_at: e.startedAt?.toISOString() ?? null,
            finished_at: e.finishedAt?.toISOString() ?? null,
        })),
    })
}
