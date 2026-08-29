import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasStoredOpsSecret } from '@/lib/opsSecretStore'
import { randomUUID } from 'node:crypto'
import { storeResourceSecret } from '@/lib/secrets/migration'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

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
        has_secret: hasStoredOpsSecret(p.encryptedSecret),
        key_path: p.keyPath,
        project_id: p.projectId,
        notes: p.notes,
        created_at: p.createdAt.toISOString(),
        updated_at: p.updatedAt.toISOString(),
    }
}

export async function GET(req: Request) {
    const authorization = await authorizeRequest(req, 'ops', 'read')
    if (authorization.response) return authorization.response
    const workspaceId = authorization.context.workspaceId
    const profiles = await prisma.serverProfile.findMany({
        where: { workspaceId },
        orderBy: { name: 'asc' },
    })

    return NextResponse.json(profiles.map(serializeProfile))
}

export async function POST(req: Request) {
    const authorization = await authorizeRequest(req, 'ops', 'create')
    if (authorization.response) return authorization.response
    const workspaceId = authorization.context.workspaceId
    const body = await req.json()
    const { name, host, port, username, auth_method, secret, key_path, project_id, notes } = body

    if (!name?.trim()) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!host?.trim()) {
        return NextResponse.json({ error: 'Host is required' }, { status: 400 })
    }
    if (!username?.trim()) {
        return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }
    if (project_id) {
        const project = await prisma.project.findFirst({ where: { id: project_id, workspaceId } })
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const profileId = randomUUID()
    let encryptedSecretJson: string | null = null
    if (secret) {
        encryptedSecretJson = await storeResourceSecret(prisma, { resourceType: 'server-profile', resourceId: profileId, field: 'password', name: `ops:${profileId}:password`, workspaceId }, secret, authorization.context.userId)
    }

    const profile = await prisma.serverProfile.create({
        data: {
            id: profileId,
            workspaceId,
            name: name.trim(),
            host: host.trim(),
            port: port ?? 22,
            username: username.trim(),
            authMethod: auth_method ?? 'password',
            encryptedSecret: encryptedSecretJson,
            keyPath: key_path ?? null,
            projectId: project_id ?? null,
            notes: notes ?? '',
        },
    })

    return NextResponse.json(serializeProfile(profile), { status: 201 })
}
