import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { createTeamAdminService } from '@/lib/rbac/adminService'

export async function POST(request: Request) { const auth = await authorizeRequest(request, 'session', 'manage'); if (auth.response) return auth.response; const body = await request.json().catch(() => ({})); const result = await createTeamAdminService(prisma).revokeGrants(auth.context.workspaceId, body.actorId); return NextResponse.json({ revoked: result.reduce((sum, entry) => sum + entry.count, 0) }) }
