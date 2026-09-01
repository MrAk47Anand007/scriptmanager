import { NextResponse } from 'next/server'
import { testSshConnection } from '@/lib/sshService'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const authorization = await authorizeRequest(req, 'ops', 'run')
    if (authorization.response) return authorization.response
    const { id } = await params

    const profile = await prisma.serverProfile.findFirst({ where: { id, workspaceId: authorization.context.workspaceId } })
    if (!profile) return NextResponse.json({ error: 'Server profile not found' }, { status: 404 })

    try {
        const result = await testSshConnection(id, authorization.context.workspaceId)
        return NextResponse.json(result)
    } catch (err) {
        return NextResponse.json(
            { success: false, error: (err as Error).message },
            { status: 500 }
        )
    }
}
