import { NextResponse } from 'next/server'
import { testSshConnection } from '@/lib/sshService'

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params

    try {
        const result = await testSshConnection(id)
        return NextResponse.json(result)
    } catch (err) {
        return NextResponse.json(
            { success: false, error: (err as Error).message },
            { status: 500 }
        )
    }
}
