import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { createTeamAdminService } from '@/lib/rbac/adminService'

export async function GET(request: Request) { const auth = await authorizeRequest(request, 'session', 'read'); if (auth.response) return auth.response; return NextResponse.json(await createTeamAdminService(prisma).listSessions(auth.context.workspaceId)) }
export async function DELETE(request: Request) { const auth = await authorizeRequest(request, 'session', 'delete'); if (auth.response) return auth.response; const { sessionId } = await request.json(); return NextResponse.json(await createTeamAdminService(prisma).revokeSession(auth.context.workspaceId, sessionId, auth.context.userId)) }
