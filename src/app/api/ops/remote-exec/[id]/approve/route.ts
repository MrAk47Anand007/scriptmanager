import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { execRemote } from '@/lib/sshService'

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
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

    // Build remote command (same logic as in remote-exec route)
    const paramValues = execution.paramValues ? JSON.parse(execution.paramValues) : {}
    const dir = execution.remotePath?.endsWith('/') ? execution.remotePath : (execution.remotePath ? execution.remotePath + '/' : '/tmp/')
    const scriptPath = `${dir}${script.filename}`

    const envPrefix = Object.keys(paramValues).length > 0
        ? Object.entries(paramValues as Record<string, string>)
            .map(([k, v]) => `${k.replace(/[^a-zA-Z0-9_]/g, '_')}=${JSON.stringify(v)}`)
            .join(' ') + ' '
        : ''

    let command: string
    if (script.filename.endsWith('.py')) command = `${envPrefix}python3 "${scriptPath}"`
    else if (script.filename.endsWith('.js')) command = `${envPrefix}node "${scriptPath}"`
    else command = `${envPrefix}bash "${scriptPath}"`

    // Fire-and-forget
    execRemote({ profileId: execution.profileId, command, remoteExecId: id }).catch(console.error)

    return NextResponse.json({ ok: true, remote_exec_id: id })
}
