import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { createTeamAdminService } from '@/lib/rbac/adminService'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(request, 'member', 'update'); if (auth.response) return auth.response
  const { id } = await params; const body = await request.json()
  try { return NextResponse.json(await createTeamAdminService(prisma).updateMembershipRole(auth.context.workspaceId, id, body.roleId)) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed' }, { status: 409 }) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(request, 'member', 'delete'); if (auth.response) return auth.response
  const { id } = await params
  try { return NextResponse.json(await createTeamAdminService(prisma).revokeMembership(auth.context.workspaceId, id)) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Revocation failed' }, { status: 409 }) }
}
