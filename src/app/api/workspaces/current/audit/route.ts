import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { createTeamAdminService } from '@/lib/rbac/adminService'

export async function GET(request: Request) { const auth = await authorizeRequest(request, 'audit', 'read'); if (auth.response) return auth.response; return NextResponse.json(await createTeamAdminService(prisma).listAudit(auth.context.workspaceId)) }
