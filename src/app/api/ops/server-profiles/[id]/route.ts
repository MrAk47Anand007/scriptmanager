import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getEncryptionKey, encryptSecret } from '@/lib/crypto'

function serializeProfile(p: {
    id: string
    name: string
    host: string
    port: number
    username: string
    authMethod: string
    encryptedSecret: string | null
    keyPath: string | null
    projectId: string | null
    notes: string
    createdAt: Date
    updatedAt: Date
}) {
    return {
        id: p.id,
        name: p.name,
        host: p.host,
        port: p.port,
        username: p.username,
        auth_method: p.authMethod,
        has_secret: !!p.encryptedSecret,
        key_path: p.keyPath,
        project_id: p.projectId,
        notes: p.notes,
        created_at: p.createdAt.toISOString(),
        updated_at: p.updatedAt.toISOString(),
    }
}

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params

    const profile = await prisma.serverProfile.findUnique({ where: { id } })
    if (!profile) {
        return NextResponse.json({ error: 'Server profile not found' }, { status: 404 })
    }

    return NextResponse.json(serializeProfile(profile))
}

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const body = await req.json()
    const { name, host, port, username, auth_method, secret, key_path, project_id, notes } = body

    const existing = await prisma.serverProfile.findUnique({ where: { id } })
    if (!existing) {
        return NextResponse.json({ error: 'Server profile not found' }, { status: 404 })
    }

    let encryptedSecretJson: string | null | undefined = undefined
    if (secret !== undefined) {
        if (secret === null || secret === '') {
            encryptedSecretJson = null
        } else {
            const key = await getEncryptionKey()
            const payload = encryptSecret(secret, key)
            encryptedSecretJson = JSON.stringify(payload)
        }
    }

    const updated = await prisma.serverProfile.update({
        where: { id },
        data: {
            ...(name !== undefined && { name: name.trim() }),
            ...(host !== undefined && { host: host.trim() }),
            ...(port !== undefined && { port }),
            ...(username !== undefined && { username: username.trim() }),
            ...(auth_method !== undefined && { authMethod: auth_method }),
            ...(encryptedSecretJson !== undefined && { encryptedSecret: encryptedSecretJson }),
            ...(key_path !== undefined && { keyPath: key_path }),
            ...(project_id !== undefined && { projectId: project_id }),
            ...(notes !== undefined && { notes }),
        },
    })

    return NextResponse.json(serializeProfile(updated))
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params

    const profile = await prisma.serverProfile.findUnique({ where: { id } })
    if (!profile) {
        return NextResponse.json({ error: 'Server profile not found' }, { status: 404 })
    }

    await prisma.serverProfile.delete({ where: { id } })

    return NextResponse.json({ message: 'Server profile deleted' })
}
