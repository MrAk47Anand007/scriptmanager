import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { createTeamAdminService } from '@/lib/rbac/adminService'

export async function GET(request: Request) {
  const auth = await authorizeRequest(request, 'member', 'read')
  if (auth.response) return auth.response
  const workspaceId = auth.context.workspaceId
  const service = createTeamAdminService(prisma)
  const [workspace, members, roles, invitations] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId } }), service.listMembers(workspaceId),
    service.listRoles(workspaceId), service.listInvitations(workspaceId),
  ])
  return NextResponse.json({ workspace, members, roles, invitations, currentUserId: auth.context.userId, permissions: auth.context.permissions })
}
