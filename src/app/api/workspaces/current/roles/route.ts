import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { createTeamAdminService } from '@/lib/rbac/adminService'

export async function GET(request: Request) { const auth = await authorizeRequest(request, 'role', 'read'); if (auth.response) return auth.response; return NextResponse.json(await createTeamAdminService(prisma).listRoles(auth.context.workspaceId)) }
export async function POST(request: Request) { const auth = await authorizeRequest(request, 'role', 'create'); if (auth.response) return auth.response; try { return NextResponse.json(await createTeamAdminService(prisma).createRole(auth.context.workspaceId, auth.context.userId, await request.json()), { status: 201 }) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Role creation failed' }, { status: 400 }) } }
