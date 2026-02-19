import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params

    const execution = await prisma.remoteExecution.findUnique({ where: { id } })
    if (!execution) {
        return NextResponse.json({ error: 'Remote execution not found' }, { status: 404 })
    }
    if (execution.status !== 'pending_approval') {
        return NextResponse.json(
            { error: `Cannot reject execution with status: ${execution.status}` },
            { status: 400 }
        )
    }

    await prisma.remoteExecution.update({
        where: { id },
        data: { status: 'rejected', finishedAt: new Date() },
    })

    return NextResponse.json({ ok: true })
}
