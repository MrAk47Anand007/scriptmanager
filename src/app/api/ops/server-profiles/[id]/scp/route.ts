import { NextResponse } from 'next/server'
import { scpScript } from '@/lib/sshService'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const authorization = await authorizeRequest(req, 'ops', 'run')
    if (authorization.response) return authorization.response
    const { id: profileId } = await params
    const body = await req.json()
    const { scriptId, remotePath, permissions } = body

    if (!scriptId) {
        return NextResponse.json({ error: 'scriptId is required' }, { status: 400 })
    }
    if (!remotePath) {
        return NextResponse.json({ error: 'remotePath is required' }, { status: 400 })
    }
    const [profile, script] = await Promise.all([
        prisma.serverProfile.findFirst({ where: { id: profileId, workspaceId: authorization.context.workspaceId } }),
        prisma.script.findFirst({ where: { id: scriptId, workspaceId: authorization.context.workspaceId } }),
    ])
    if (!profile) return NextResponse.json({ error: 'Server profile not found' }, { status: 404 })
    if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })

    try {
        const result = await scpScript({ profileId, scriptId, remotePath, permissions, workspaceId: authorization.context.workspaceId })
        return NextResponse.json(result, { status: result.success ? 200 : 500 })
    } catch (err) {
        return NextResponse.json(
            { success: false, remote_path: '', error: (err as Error).message },
            { status: 500 }
        )
    }
}
