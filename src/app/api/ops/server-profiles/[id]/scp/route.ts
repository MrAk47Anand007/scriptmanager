import { NextResponse } from 'next/server'
import { scpScript } from '@/lib/sshService'

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: profileId } = await params
    const body = await req.json()
    const { scriptId, remotePath, permissions } = body

    if (!scriptId) {
        return NextResponse.json({ error: 'scriptId is required' }, { status: 400 })
    }
    if (!remotePath) {
        return NextResponse.json({ error: 'remotePath is required' }, { status: 400 })
    }

    try {
        const result = await scpScript({ profileId, scriptId, remotePath, permissions })
        return NextResponse.json(result, { status: result.success ? 200 : 500 })
    } catch (err) {
        return NextResponse.json(
            { success: false, remote_path: '', error: (err as Error).message },
            { status: 500 }
        )
    }
}
