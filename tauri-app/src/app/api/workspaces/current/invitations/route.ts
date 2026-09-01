import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { createTeamAdminService } from '@/lib/rbac/adminService'

export async function POST(request: Request) {
  const auth = await authorizeRequest(request, 'member', 'create')
  if (auth.response) return auth.response
  const body = await request.json()
  if (!body.email || !body.roleId) return NextResponse.json({ error: 'email and roleId are required' }, { status: 400 })
  try {
    return NextResponse.json(await createTeamAdminService(prisma).invite({ workspaceId: auth.context.workspaceId, email: body.email, roleId: body.roleId, invitedById: auth.context.userId }), { status: 201 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invitation failed' }, { status: 400 }) }
}
